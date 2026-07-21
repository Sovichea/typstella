use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaledFontResult {
    pub directory: PathBuf,
    pub family: String,
    pub scale: f32,
    pub generated_files: Vec<String>,
    pub changed: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaledFontRequest {
    pub family: String,
    pub scale: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaledFontManifest<'a> {
    version: u32,
    family: &'a str,
    scale: f32,
    files: &'a [String],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredScaledFontManifest {
    family: String,
    scale: f32,
    files: Vec<String>,
}

fn validate_request(workspace_root: &Path, family: &str, scale: f32) -> Result<(), String> {
    if family.trim().is_empty() {
        return Err("A document font family is required.".into());
    }
    if !scale.is_finite() || !(0.5..=2.0).contains(&scale) {
        return Err("Document font scale must be between 0.5 and 2.0.".into());
    }
    if !workspace_root.is_dir() {
        return Err("The workspace root does not exist.".into());
    }
    Ok(())
}

fn current_manifest(generated_dir: &Path) -> Option<StoredScaledFontManifest> {
    let manifest: StoredScaledFontManifest =
        serde_json::from_slice(&fs::read(generated_dir.join("manifest.json")).ok()?).ok()?;
    manifest
        .files
        .iter()
        .all(|file| generated_dir.join(file).is_file())
        .then_some(manifest)
}

fn generated_family_dir(workspace_root: &Path, family: &str) -> PathBuf {
    workspace_root
        .join(".typsastra")
        .join("fonts")
        .join("generated")
        .join(safe_file_stem(&family.to_ascii_lowercase()))
}

pub fn scaled_workspace_font_update_required(
    workspace_root: &Path,
    family: &str,
    scale: f32,
) -> Result<bool, String> {
    validate_request(workspace_root, family, scale)?;
    let generated_root = workspace_root
        .join(".typsastra")
        .join("fonts")
        .join("generated");
    if generated_root.join("manifest.json").is_file() {
        return Ok(true);
    }
    let generated_dir = generated_family_dir(workspace_root, family);
    if (scale - 1.0).abs() <= 0.0001 {
        return Ok(generated_dir.exists());
    }
    let Some(manifest) = current_manifest(&generated_dir) else {
        return Ok(true);
    };
    Ok(!manifest.family.eq_ignore_ascii_case(family) || (manifest.scale - scale).abs() > 0.0001)
}

pub fn scaled_workspace_font_set_update_required(
    workspace_root: &Path,
    requests: &[ScaledFontRequest],
) -> Result<bool, String> {
    let generated_root = workspace_root
        .join(".typsastra")
        .join("fonts")
        .join("generated");
    let mut requested_scales = std::collections::BTreeMap::<String, f32>::new();
    for request in requests {
        validate_request(workspace_root, &request.family, request.scale)?;
        let key = request.family.to_lowercase();
        if requested_scales
            .get(&key)
            .is_some_and(|scale| (scale - request.scale).abs() > 0.0001)
        {
            return Err(format!(
                "The font family {:?} cannot use different scales for different scripts. Choose separate families or use one scale.",
                request.family
            ));
        }
        requested_scales.insert(key, request.scale);
    }
    if generated_root.join("manifest.json").is_file() {
        return Ok(true);
    }
    let desired: std::collections::BTreeMap<String, f32> = requested_scales
        .into_iter()
        .filter(|(_, scale)| (scale - 1.0).abs() > 0.0001)
        .collect();
    let mut current = std::collections::BTreeMap::new();
    if generated_root.is_dir() {
        for entry in fs::read_dir(&generated_root)
            .map_err(|error| format!("Failed to inspect {}: {error}", generated_root.display()))?
        {
            let path = entry.map_err(|error| error.to_string())?.path();
            if !path.is_dir() {
                continue;
            }
            let Some(manifest) = current_manifest(&path) else {
                return Ok(true);
            };
            current.insert(manifest.family.to_lowercase(), manifest.scale);
        }
    }
    Ok(desired.len() != current.len()
        || desired.iter().any(|(family, scale)| {
            current
                .get(family)
                .is_none_or(|current_scale| (current_scale - scale).abs() > 0.0001)
        }))
}

fn safe_file_stem(value: &str) -> String {
    let value: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect();
    value.trim_matches('-').to_string()
}

fn stable_hash(bytes: &[u8], face_index: u32, scale: f32) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in bytes
        .iter()
        .copied()
        .chain(face_index.to_be_bytes())
        .chain(scale.to_bits().to_be_bytes())
    {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    hash
}

fn read_source(source: &fontdb::Source) -> Result<(Vec<u8>, Option<&Path>), String> {
    match source {
        fontdb::Source::File(path) => fs::read(path)
            .map(|bytes| (bytes, Some(path.as_path())))
            .map_err(|error| format!("Failed to read {}: {error}", path.display())),
        fontdb::Source::Binary(bytes) => Ok((bytes.as_ref().as_ref().to_vec(), None)),
        fontdb::Source::SharedFile(path, bytes) => {
            Ok((bytes.as_ref().as_ref().to_vec(), Some(path.as_path())))
        }
    }
}

pub fn prepare_scaled_workspace_font(
    workspace_root: &Path,
    family: &str,
    scale: f32,
) -> Result<ScaledFontResult, String> {
    validate_request(workspace_root, family, scale)?;

    let fonts_dir = workspace_root.join(".typsastra").join("fonts");
    let generated_root = fonts_dir.join("generated");
    if generated_root.join("manifest.json").is_file() {
        fs::remove_dir_all(&generated_root)
            .map_err(|error| format!("Failed to migrate {}: {error}", generated_root.display()))?;
    }
    let generated_dir = generated_family_dir(workspace_root, family);
    if !scaled_workspace_font_update_required(workspace_root, family, scale)? {
        let generated_files = current_manifest(&generated_dir)
            .map(|manifest| manifest.files)
            .unwrap_or_default();
        return Ok(ScaledFontResult {
            directory: generated_dir,
            family: family.to_string(),
            scale,
            generated_files,
            changed: false,
        });
    }
    if generated_dir.exists() {
        fs::remove_dir_all(&generated_dir)
            .map_err(|error| format!("Failed to replace {}: {error}", generated_dir.display()))?;
    }
    if (scale - 1.0).abs() <= 0.0001 {
        if generated_root.is_dir()
            && fs::read_dir(&generated_root)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false)
        {
            let _ = fs::remove_dir(&generated_root);
        }
        return Ok(ScaledFontResult {
            directory: generated_dir,
            family: family.to_string(),
            scale,
            generated_files: Vec::new(),
            changed: true,
        });
    }
    fs::create_dir_all(&generated_dir)
        .map_err(|error| format!("Failed to create {}: {error}", generated_dir.display()))?;
    fs::write(fonts_dir.join(".gitignore"), "generated/\n")
        .map_err(|error| format!("Failed to protect generated fonts from Git: {error}"))?;

    let mut generated_files = Vec::new();
    if (scale - 1.0).abs() > 0.0001 {
        let mut database = fontdb::Database::new();
        database.load_system_fonts();
        let faces: Vec<_> = database
            .faces()
            .filter(|face| {
                face.families
                    .iter()
                    .any(|(candidate, _)| candidate.eq_ignore_ascii_case(family))
            })
            .cloned()
            .collect();
        if faces.is_empty() {
            return Err(format!(
                "The system font family {family:?} could not be located."
            ));
        }

        let mut written_sources = BTreeSet::new();
        for face in faces {
            let (bytes, source_path) = read_source(&face.source)?;
            let source_key = source_path
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_else(|| format!("binary-{}", stable_hash(&bytes, face.index, 1.0)));
            if !written_sources.insert(source_key) {
                continue;
            }
            if face.index != 0 || bytes.get(..4) == Some(b"ttcf") {
                return Err(format!(
                    "{family:?} is stored in a font collection. Select an individual TTF or OTF face for scaling."
                ));
            }
            let scaled = typsastra_font_scaler::scale_font_uniform(&bytes, scale)
                .map_err(|error| format!("Failed to scale {family:?}: {error}"))?;
            let extension = source_path
                .and_then(Path::extension)
                .and_then(|extension| extension.to_str())
                .filter(|extension| {
                    matches!(extension.to_ascii_lowercase().as_str(), "ttf" | "otf")
                })
                .unwrap_or("ttf");
            let file_name = format!(
                "{}-{:016x}.{}",
                safe_file_stem(family),
                stable_hash(&bytes, face.index, scale),
                extension
            );
            let destination = generated_dir.join(&file_name);
            let mut temporary = tempfile::NamedTempFile::new_in(&generated_dir)
                .map_err(|error| format!("Failed to stage scaled font: {error}"))?;
            std::io::Write::write_all(&mut temporary, &scaled)
                .map_err(|error| format!("Failed to write scaled font: {error}"))?;
            temporary
                .persist(&destination)
                .map_err(|error| format!("Failed to install scaled font: {}", error.error))?;
            generated_files.push(file_name);
        }
    }

    let manifest = ScaledFontManifest {
        version: 1,
        family,
        scale,
        files: &generated_files,
    };
    fs::write(
        generated_dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Failed to write scaled-font manifest: {error}"))?;

    Ok(ScaledFontResult {
        directory: generated_dir,
        family: family.to_string(),
        scale,
        generated_files,
        changed: true,
    })
}

pub fn clear_scaled_workspace_fonts(workspace_root: &Path) -> Result<(), String> {
    if !workspace_root.is_dir() {
        return Err("The workspace root does not exist.".into());
    }
    let generated_dir = workspace_root
        .join(".typsastra")
        .join("fonts")
        .join("generated");
    if generated_dir.exists() {
        fs::remove_dir_all(&generated_dir)
            .map_err(|error| format!("Failed to remove {}: {error}", generated_dir.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unit_scale_is_a_noop_without_generated_fonts() {
        let workspace = tempfile::tempdir().unwrap();
        assert!(
            !scaled_workspace_font_update_required(workspace.path(), "MiSans Khmer", 1.0).unwrap()
        );

        let result = prepare_scaled_workspace_font(workspace.path(), "MiSans Khmer", 1.0).unwrap();
        assert!(!result.changed);
        assert!(result.generated_files.is_empty());
        assert!(!result.directory.exists());
    }

    #[test]
    fn unit_scale_removes_previous_scaled_output_once() {
        let workspace = tempfile::tempdir().unwrap();
        let generated = generated_family_dir(workspace.path(), "MiSans Khmer");
        fs::create_dir_all(&generated).unwrap();
        fs::write(generated.join("old.ttf"), b"font").unwrap();
        fs::write(
            generated.join("manifest.json"),
            serde_json::json!({
                "version": 1,
                "family": "MiSans Khmer",
                "scale": 1.2,
                "files": ["old.ttf"]
            })
            .to_string(),
        )
        .unwrap();

        assert!(
            scaled_workspace_font_update_required(workspace.path(), "MiSans Khmer", 1.0).unwrap()
        );
        let result = prepare_scaled_workspace_font(workspace.path(), "MiSans Khmer", 1.0).unwrap();
        assert!(result.changed);
        assert!(!generated.exists());
        assert!(
            !scaled_workspace_font_update_required(workspace.path(), "MiSans Khmer", 1.0).unwrap()
        );
    }

    #[test]
    fn matching_generated_font_is_reused() {
        let workspace = tempfile::tempdir().unwrap();
        let generated = generated_family_dir(workspace.path(), "MiSans Khmer");
        fs::create_dir_all(&generated).unwrap();
        fs::write(generated.join("cached.ttf"), b"font").unwrap();
        fs::write(
            generated.join("manifest.json"),
            serde_json::json!({
                "version": 1,
                "family": "MiSans Khmer",
                "scale": 1.2,
                "files": ["cached.ttf"]
            })
            .to_string(),
        )
        .unwrap();

        assert!(
            !scaled_workspace_font_update_required(workspace.path(), "MiSans Khmer", 1.2).unwrap()
        );
        let result = prepare_scaled_workspace_font(workspace.path(), "MiSans Khmer", 1.2).unwrap();
        assert!(!result.changed);
        assert_eq!(result.generated_files, vec!["cached.ttf"]);
    }

    #[test]
    fn removing_one_scaled_family_preserves_the_others() {
        let workspace = tempfile::tempdir().unwrap();
        for (family, scale) in [("MiSans Khmer", 1.2), ("MiSans Lao", 1.1)] {
            let generated = generated_family_dir(workspace.path(), family);
            fs::create_dir_all(&generated).unwrap();
            fs::write(generated.join("cached.ttf"), b"font").unwrap();
            fs::write(
                generated.join("manifest.json"),
                serde_json::json!({
                    "version": 1,
                    "family": family,
                    "scale": scale,
                    "files": ["cached.ttf"]
                })
                .to_string(),
            )
            .unwrap();
        }

        prepare_scaled_workspace_font(workspace.path(), "MiSans Khmer", 1.0).unwrap();
        assert!(!generated_family_dir(workspace.path(), "MiSans Khmer").exists());
        assert!(generated_family_dir(workspace.path(), "MiSans Lao").exists());
        assert!(
            !scaled_workspace_font_update_required(workspace.path(), "MiSans Lao", 1.1).unwrap()
        );
    }

    #[test]
    fn scaled_family_set_detects_additions_and_removals() {
        let workspace = tempfile::tempdir().unwrap();
        let generated = generated_family_dir(workspace.path(), "MiSans Khmer");
        fs::create_dir_all(&generated).unwrap();
        fs::write(generated.join("cached.ttf"), b"font").unwrap();
        fs::write(
            generated.join("manifest.json"),
            serde_json::json!({
                "version": 1,
                "family": "MiSans Khmer",
                "scale": 1.2,
                "files": ["cached.ttf"]
            })
            .to_string(),
        )
        .unwrap();
        let matching = [ScaledFontRequest {
            family: "MiSans Khmer".into(),
            scale: 1.2,
        }];
        assert!(!scaled_workspace_font_set_update_required(workspace.path(), &matching).unwrap());
        assert!(scaled_workspace_font_set_update_required(workspace.path(), &[]).unwrap());
        let added = [
            ScaledFontRequest {
                family: "MiSans Khmer".into(),
                scale: 1.2,
            },
            ScaledFontRequest {
                family: "MiSans Lao".into(),
                scale: 1.1,
            },
        ];
        assert!(scaled_workspace_font_set_update_required(workspace.path(), &added).unwrap());
    }

    #[test]
    fn rejects_conflicting_scales_for_one_internal_family() {
        let workspace = tempfile::tempdir().unwrap();
        let requests = [
            ScaledFontRequest {
                family: "Shared Family".into(),
                scale: 0.9,
            },
            ScaledFontRequest {
                family: "Shared Family".into(),
                scale: 1.0,
            },
        ];
        assert!(
            scaled_workspace_font_set_update_required(workspace.path(), &requests)
                .unwrap_err()
                .contains("cannot use different scales")
        );
    }
}
