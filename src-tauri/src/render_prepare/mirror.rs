use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use super::scanner::{scan_typst_content, ScanState};
use super::segment::{prepare_khmer_text_for_rendering, KhmerTextSegmenter};
use super::sourcemap::{MappingKind, SourceMap, SOURCE_MAP_VERSION};

const RENDER_CACHE_LAYOUT_VERSION: &str = "3-flat-preview-output";
const RENDER_CACHE_OWNER_SCHEMA_VERSION: u32 = 1;
const RENDER_CACHE_OWNER_FILE: &str = "workspace-owner.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RenderCacheOwner {
    schema_version: u32,
    workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPrepareWarning {
    pub file_path: PathBuf,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPrepareOptions {
    pub enable_khmer_zws: bool,
    pub project_root: PathBuf,
    pub entry_file: PathBuf,
    pub cache_root: PathBuf,
    pub generate_source_map: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPrepareResult {
    pub generated_entry_file: PathBuf,
    pub changed_files: Vec<PathBuf>,
    pub warnings: Vec<RenderPrepareWarning>,
}

pub fn mirror_project_cancellable(
    options: &RenderPrepareOptions,
    segmenter: Option<&KhmerTextSegmenter>,
    is_cancelled: impl Fn() -> bool,
) -> Result<RenderPrepareResult, String> {
    let project_root = &options.project_root;
    let cache_root = &options.cache_root;

    ensure_render_cache_owner(project_root, cache_root).map_err(|error| error.to_string())?;
    let render_dir = cache_root.join("render");
    let maps_dir = cache_root.join("maps");
    let preview_dir = cache_root.join("preview");

    migrate_render_cache_layout(cache_root, &render_dir, &maps_dir, &preview_dir)
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&render_dir).map_err(|e| e.to_string())?;
    if options.generate_source_map {
        fs::create_dir_all(&maps_dir).map_err(|e| e.to_string())?;
    }

    let _ = clean_stale_cache_files(&render_dir, &maps_dir, project_root);

    let mut changed_files = Vec::new();
    let mut warnings = Vec::new();

    let mut files_to_process = Vec::new();
    walk_project_dir(
        project_root,
        project_root,
        cache_root,
        &mut files_to_process,
    )
    .map_err(|e| e.to_string())?;

    if options.entry_file.exists() && options.entry_file.is_file() {
        if let Ok(rel_path) = options.entry_file.strip_prefix(project_root) {
            let rel_path_buf = rel_path.to_path_buf();
            if !files_to_process.iter().any(|(p, _)| p == &rel_path_buf) {
                files_to_process.push((rel_path_buf, false));
            }
        }
    }

    for (rel_path, is_dir) in files_to_process {
        if is_cancelled() {
            return Err("Render preparation cancelled.".to_string());
        }
        let src_path = project_root.join(&rel_path);
        let dest_path = render_dir.join(&rel_path);

        if is_dir {
            fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            if rel_path.extension().and_then(|s| s.to_str()) == Some("typ") {
                let result = process_typ_file(
                    &src_path, &dest_path, &rel_path, &maps_dir, options, segmenter,
                );
                match result {
                    Ok(changed) => {
                        if changed {
                            changed_files.push(dest_path.clone());
                        }
                    }
                    Err(e) => {
                        warnings.push(RenderPrepareWarning {
                            file_path: src_path.clone(),
                            message: format!("Failed to process Typst file: {}", e),
                        });
                        if let Err(err) = fs::copy(&src_path, &dest_path) {
                            warnings.push(RenderPrepareWarning {
                                file_path: src_path.clone(),
                                message: format!("Fallback copy failed: {}", err),
                            });
                        }
                    }
                }
            } else {
                match copy_asset_to_cache(&src_path, &dest_path) {
                    Ok(copied) => {
                        if copied {
                            changed_files.push(dest_path);
                        }
                    }
                    Err(err) => {
                        warnings.push(RenderPrepareWarning {
                            file_path: src_path.clone(),
                            message: format!("Failed to copy asset into render cache: {}", err),
                        });
                    }
                }
            }
        }
    }

    let generated_entry_file = render_dir.join(
        options
            .entry_file
            .strip_prefix(project_root)
            .unwrap_or(&options.entry_file),
    );

    Ok(RenderPrepareResult {
        generated_entry_file,
        changed_files,
        warnings,
    })
}

fn normalized_workspace_identity(project_root: &Path) -> String {
    let resolved = fs::canonicalize(project_root).unwrap_or_else(|_| project_root.to_path_buf());
    let identity = resolved.to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    {
        identity.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        identity
    }
}

fn expected_render_cache_owner(project_root: &Path) -> RenderCacheOwner {
    RenderCacheOwner {
        schema_version: RENDER_CACHE_OWNER_SCHEMA_VERSION,
        workspace_root: normalized_workspace_identity(project_root),
    }
}

fn read_render_cache_owner(cache_root: &Path) -> Option<RenderCacheOwner> {
    let bytes = fs::read(cache_root.join(RENDER_CACHE_OWNER_FILE)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn remove_render_cache(cache_root: &Path) -> Result<(), std::io::Error> {
    let Ok(metadata) = fs::symlink_metadata(cache_root) else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        fs::remove_file(cache_root).or_else(|_| fs::remove_dir(cache_root))
    } else {
        fs::remove_dir_all(cache_root)
    }
}

fn write_render_cache_owner(project_root: &Path, cache_root: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(cache_root)?;
    let owner = expected_render_cache_owner(project_root);
    let bytes = serde_json::to_vec_pretty(&owner).map_err(std::io::Error::other)?;
    fs::write(cache_root.join(RENDER_CACHE_OWNER_FILE), bytes)
}

/// Invalidates a copied or moved workspace cache before any compiler process
/// can observe hard links or generated sources owned by the former location.
/// A missing cache remains missing until preview preparation is requested.
pub fn validate_existing_render_cache_owner(
    project_root: &Path,
    cache_root: &Path,
) -> Result<bool, std::io::Error> {
    if !cache_root.exists() {
        return Ok(false);
    }
    if read_render_cache_owner(cache_root).as_ref()
        == Some(&expected_render_cache_owner(project_root))
    {
        return Ok(false);
    }
    remove_render_cache(cache_root)?;
    Ok(true)
}

fn ensure_render_cache_owner(project_root: &Path, cache_root: &Path) -> Result<(), std::io::Error> {
    let invalidated = validate_existing_render_cache_owner(project_root, cache_root)?;
    if invalidated || !cache_root.exists() {
        write_render_cache_owner(project_root, cache_root)?;
    }
    Ok(())
}

fn migrate_render_cache_layout(
    cache_root: &Path,
    render_dir: &Path,
    maps_dir: &Path,
    preview_dir: &Path,
) -> Result<(), std::io::Error> {
    fs::create_dir_all(cache_root)?;
    let marker = cache_root.join("render-layout-version");
    if fs::read_to_string(&marker)
        .ok()
        .is_some_and(|version| version.trim() == RENDER_CACHE_LAYOUT_VERSION)
    {
        return Ok(());
    }

    if render_dir.exists() {
        fs::remove_dir_all(render_dir)?;
    }
    if maps_dir.exists() {
        fs::remove_dir_all(maps_dir)?;
    }
    if preview_dir.exists() {
        fs::remove_dir_all(preview_dir)?;
    }
    fs::write(marker, format!("{RENDER_CACHE_LAYOUT_VERSION}\n"))
}

fn clean_stale_cache_files(
    render_dir: &Path,
    maps_dir: &Path,
    project_root: &Path,
) -> Result<(), std::io::Error> {
    if !render_dir.exists() {
        return Ok(());
    }
    let mut to_delete = Vec::new();
    walk_for_stale(render_dir, render_dir, project_root, &mut to_delete)?;
    for path in to_delete {
        if path.is_dir() {
            let _ = fs::remove_dir_all(&path);
        } else {
            let _ = fs::remove_file(&path);
            let rel = path.strip_prefix(render_dir).unwrap_or(&path);
            let mut map_rel = rel.to_path_buf();
            let ext = map_rel
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("typ");
            map_rel.set_extension(format!("{}.map.json", ext));
            let map_path = maps_dir.join(map_rel);
            if map_path.exists() {
                let _ = fs::remove_file(map_path);
            }
        }
    }
    Ok(())
}

fn walk_for_stale(
    base_render: &Path,
    dir: &Path,
    project_root: &Path,
    out: &mut Vec<PathBuf>,
) -> Result<(), std::io::Error> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path.strip_prefix(base_render).unwrap_or(&path);
        let src_path = project_root.join(rel);

        if !src_path.exists() {
            out.push(path);
        } else if path.is_dir() {
            walk_for_stale(base_render, &path, project_root, out)?;
        }
    }
    Ok(())
}

pub fn prepare_single_in_memory_file(
    options: &RenderPrepareOptions,
    segmenter: Option<&KhmerTextSegmenter>,
    file_path: &Path,
    source_code: &str,
) -> Result<PathBuf, String> {
    let project_root = &options.project_root;
    let cache_root = &options.cache_root;

    ensure_render_cache_owner(project_root, cache_root).map_err(|error| error.to_string())?;
    let render_dir = cache_root.join("render");
    let maps_dir = cache_root.join("maps");

    let rel_path = file_path.strip_prefix(project_root).unwrap_or(file_path);
    let dest_path = render_dir.join(rel_path);

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut sourcemap = SourceMap::new(
        file_path.to_string_lossy().to_string(),
        dest_path.to_string_lossy().to_string(),
    );

    let mut generated_content = String::new();
    let chunks = scan_typst_content(source_code);

    for (state, start, end, scope) in chunks {
        let chunk_text = &source_code[start..end];
        if options.enable_khmer_zws && state == ScanState::MarkupText {
            let segmenter =
                segmenter.ok_or_else(|| "Khmer segmenter is unavailable.".to_string())?;
            let prepared = prepare_khmer_text_for_rendering(
                chunk_text,
                &segmenter.segmenter,
                &segmenter.hyphenation,
                start,
                generated_content.len(),
                &mut sourcemap,
                scope,
            );
            generated_content.push_str(&prepared);
        } else {
            let gen_start = generated_content.len();
            generated_content.push_str(chunk_text);
            sourcemap.add_mapping(
                gen_start,
                generated_content.len(),
                start,
                end,
                MappingKind::Original,
            );
        }
    }

    fs::write(&dest_path, &generated_content).map_err(|e| e.to_string())?;

    if options.generate_source_map {
        let mut map_rel = rel_path.to_path_buf();
        let ext = map_rel
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("typ");
        map_rel.set_extension(format!("{}.map.json", ext));
        let map_path = maps_dir.join(map_rel);
        if let Some(parent) = map_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let map_json = serde_json::to_string_pretty(&sourcemap).map_err(|e| e.to_string())?;
        fs::write(map_path, map_json).map_err(|e| e.to_string())?;
    }

    Ok(dest_path)
}

fn walk_project_dir(
    root: &Path,
    dir: &Path,
    cache_root: &Path,
    out: &mut Vec<(PathBuf, bool)>,
) -> Result<(), std::io::Error> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.starts_with(cache_root) || path == cache_root {
            continue;
        }

        let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if file_name.starts_with('.')
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "dist"
        {
            continue;
        }

        let rel_path = path.strip_prefix(root).unwrap_or(&path).to_path_buf();
        let is_dir = path.is_dir();
        out.push((rel_path.clone(), is_dir));

        if is_dir {
            walk_project_dir(root, &path, cache_root, out)?;
        }
    }
    Ok(())
}

fn copy_asset_to_cache(src: &Path, dest: &Path) -> Result<bool, std::io::Error> {
    // Cache artifacts must remain regular files. A symbolic link back into the
    // workspace can make Explorer and backup/copy tools follow the link while
    // duplicating a project, causing the operation to hang or recurse.
    //
    // A hard link has ordinary file semantics but shares the source file's
    // storage allocation. Since the cache lives inside the workspace it will
    // normally be on the same filesystem, so large unused asset collections do
    // not consume their size twice. Filesystems that reject hard links retain
    // the portable copy fallback.
    if let Ok(meta) = fs::symlink_metadata(dest) {
        if meta.is_dir() {
            fs::remove_dir_all(dest)?;
        } else if meta.file_type().is_symlink() {
            fs::remove_file(dest)?;
        } else if let (Ok(src_meta), Ok(dest_meta)) = (fs::metadata(src), fs::metadata(dest)) {
            if src_meta.len() == dest_meta.len() {
                if let (Ok(src_modified), Ok(dest_modified)) =
                    (src_meta.modified(), dest_meta.modified())
                {
                    if src_modified <= dest_modified {
                        return Ok(false);
                    }
                }
            }
            fs::remove_file(dest)?;
        }
    }

    let source_is_symlink = fs::symlink_metadata(src)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false);
    if source_is_symlink || fs::hard_link(src, dest).is_err() {
        fs::copy(src, dest)?;
    }
    Ok(true)
}

fn process_typ_file(
    src: &Path,
    dest: &Path,
    rel_path: &Path,
    maps_dir: &Path,
    options: &RenderPrepareOptions,
    segmenter: Option<&KhmerTextSegmenter>,
) -> Result<bool, String> {
    if dest.exists() {
        if let (Ok(src_meta), Ok(dest_meta)) = (fs::metadata(src), fs::metadata(dest)) {
            if let (Ok(src_mod), Ok(dest_mod)) = (src_meta.modified(), dest_meta.modified()) {
                if src_mod <= dest_mod {
                    let map_is_current = if options.generate_source_map {
                        let mut map_rel = rel_path.to_path_buf();
                        let ext = map_rel
                            .extension()
                            .and_then(|s| s.to_str())
                            .unwrap_or("typ");
                        map_rel.set_extension(format!("{}.map.json", ext));
                        fs::read_to_string(maps_dir.join(map_rel))
                            .ok()
                            .and_then(|content| serde_json::from_str::<SourceMap>(&content).ok())
                            .is_some_and(|map| map.version == SOURCE_MAP_VERSION)
                    } else {
                        true
                    };
                    if map_is_current {
                        return Ok(false);
                    }
                }
            }
        }
    }

    let source_content = fs::read_to_string(src).map_err(|e| e.to_string())?;

    let mut sourcemap = SourceMap::new(
        src.to_string_lossy().to_string(),
        dest.to_string_lossy().to_string(),
    );

    let mut generated_content = String::new();
    let chunks = scan_typst_content(&source_content);

    for (state, start, end, scope) in chunks {
        let chunk_text = &source_content[start..end];
        if options.enable_khmer_zws && state == ScanState::MarkupText {
            let segmenter =
                segmenter.ok_or_else(|| "Khmer segmenter is unavailable.".to_string())?;
            let prepared = prepare_khmer_text_for_rendering(
                chunk_text,
                &segmenter.segmenter,
                &segmenter.hyphenation,
                start,
                generated_content.len(),
                &mut sourcemap,
                scope,
            );
            generated_content.push_str(&prepared);
        } else {
            let gen_start = generated_content.len();
            generated_content.push_str(chunk_text);
            sourcemap.add_mapping(
                gen_start,
                generated_content.len(),
                start,
                end,
                MappingKind::Original,
            );
        }
    }

    fs::write(dest, &generated_content).map_err(|e| e.to_string())?;

    if options.generate_source_map {
        let mut map_rel = rel_path.to_path_buf();
        let ext = map_rel
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("typ");
        map_rel.set_extension(format!("{}.map.json", ext));
        let map_path = maps_dir.join(map_rel);
        if let Some(parent) = map_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let map_json = serde_json::to_string_pretty(&sourcemap).map_err(|e| e.to_string())?;
        fs::write(map_path, map_json).map_err(|e| e.to_string())?;
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn materializes_pdf_assets_as_regular_cache_files() {
        let workspace = tempfile::tempdir().unwrap();
        let source = workspace.path().join("figure.pdf");
        let cache_file = workspace.path().join(".typsastra/cache/render/figure.pdf");
        fs::write(&source, b"%PDF-test").unwrap();
        fs::create_dir_all(cache_file.parent().unwrap()).unwrap();

        assert!(copy_asset_to_cache(&source, &cache_file).unwrap());
        assert_eq!(fs::read(&cache_file).unwrap(), b"%PDF-test");
        let metadata = fs::symlink_metadata(&cache_file).unwrap();
        assert!(metadata.file_type().is_file());
        assert!(!metadata.file_type().is_symlink());
    }

    #[test]
    fn hard_linked_assets_share_storage_without_owning_the_source() {
        let workspace = tempfile::tempdir().unwrap();
        let probe_source = workspace.path().join("hard-link-probe-source");
        let probe_dest = workspace.path().join("hard-link-probe-dest");
        fs::write(&probe_source, b"probe").unwrap();
        if fs::hard_link(&probe_source, &probe_dest).is_err() {
            // The production path uses an ordinary copy on this filesystem.
            return;
        }
        fs::remove_file(&probe_dest).unwrap();

        let source = workspace.path().join("photo.png");
        let cache_file = workspace.path().join(".typsastra/cache/render/photo.png");
        fs::write(&source, b"original").unwrap();
        fs::create_dir_all(cache_file.parent().unwrap()).unwrap();

        assert!(copy_asset_to_cache(&source, &cache_file).unwrap());
        fs::write(&source, b"updated").unwrap();
        assert_eq!(fs::read(&cache_file).unwrap(), b"updated");

        fs::remove_file(&cache_file).unwrap();
        assert_eq!(fs::read(&source).unwrap(), b"updated");
    }

    #[test]
    fn migrates_existing_render_copies_once() {
        let workspace = tempfile::tempdir().unwrap();
        let cache_root = workspace.path().join(".typsastra/cache");
        let render_dir = cache_root.join("render");
        let maps_dir = cache_root.join("maps");
        let preview_dir = cache_root.join("preview");
        fs::create_dir_all(&render_dir).unwrap();
        fs::create_dir_all(&maps_dir).unwrap();
        fs::create_dir_all(preview_dir.join(".typsastra/cache/render")).unwrap();
        fs::write(render_dir.join("old-copy.png"), b"duplicated").unwrap();
        fs::write(maps_dir.join("old.typ.map.json"), b"{}").unwrap();
        fs::write(
            preview_dir.join(".typsastra/cache/render/main.pdf"),
            b"old preview",
        )
        .unwrap();

        migrate_render_cache_layout(&cache_root, &render_dir, &maps_dir, &preview_dir).unwrap();
        assert!(!render_dir.exists());
        assert!(!maps_dir.exists());
        assert!(!preview_dir.exists());
        assert_eq!(
            fs::read_to_string(cache_root.join("render-layout-version"))
                .unwrap()
                .trim(),
            RENDER_CACHE_LAYOUT_VERSION
        );

        fs::create_dir_all(&render_dir).unwrap();
        fs::write(render_dir.join("current.png"), b"keep").unwrap();
        migrate_render_cache_layout(&cache_root, &render_dir, &maps_dir, &preview_dir).unwrap();
        assert_eq!(fs::read(render_dir.join("current.png")).unwrap(), b"keep");
    }

    #[test]
    fn invalidates_a_render_cache_copied_from_another_workspace() {
        let source_workspace = tempfile::tempdir().unwrap();
        let copied_parent = tempfile::tempdir().unwrap();
        let copied_workspace = copied_parent.path().join("copied-project");
        let source_cache = source_workspace.path().join(".typsastra/cache");
        let copied_cache = copied_workspace.join(".typsastra/cache");
        let source_asset = source_workspace.path().join("images/photo.png");

        write_render_cache_owner(source_workspace.path(), &source_cache).unwrap();
        fs::create_dir_all(source_asset.parent().unwrap()).unwrap();
        fs::write(&source_asset, b"original asset").unwrap();
        fs::create_dir_all(source_cache.join("render/images")).unwrap();
        let source_cache_asset = source_cache.join("render/images/photo.png");
        if fs::hard_link(&source_asset, &source_cache_asset).is_err() {
            fs::copy(&source_asset, &source_cache_asset).unwrap();
        }

        fs::create_dir_all(&copied_cache).unwrap();
        fs::copy(
            source_cache.join(RENDER_CACHE_OWNER_FILE),
            copied_cache.join(RENDER_CACHE_OWNER_FILE),
        )
        .unwrap();
        fs::create_dir_all(copied_cache.join("render/images")).unwrap();
        // Simulate a copy tool that preserves a cache link to the old
        // workspace rather than materializing independent bytes.
        let copied_cache_asset = copied_cache.join("render/images/photo.png");
        if fs::hard_link(&source_asset, &copied_cache_asset).is_err() {
            fs::copy(&source_asset, &copied_cache_asset).unwrap();
        }
        fs::create_dir_all(copied_workspace.join(".typsastra")).unwrap();
        fs::write(
            copied_workspace.join(".typsastra/config.json"),
            b"{\"project\":\"keep\"}",
        )
        .unwrap();

        assert!(validate_existing_render_cache_owner(&copied_workspace, &copied_cache).unwrap());
        assert!(!copied_cache.exists());
        assert_eq!(fs::read(&source_asset).unwrap(), b"original asset");
        assert_eq!(
            fs::read(copied_workspace.join(".typsastra/config.json")).unwrap(),
            b"{\"project\":\"keep\"}"
        );

        ensure_render_cache_owner(&copied_workspace, &copied_cache).unwrap();
        assert_eq!(
            read_render_cache_owner(&copied_cache),
            Some(expected_render_cache_owner(&copied_workspace))
        );
    }

    #[test]
    fn preserves_a_render_cache_owned_by_the_current_workspace() {
        let workspace = tempfile::tempdir().unwrap();
        let cache_root = workspace.path().join(".typsastra/cache");
        write_render_cache_owner(workspace.path(), &cache_root).unwrap();
        fs::create_dir_all(cache_root.join("render")).unwrap();
        fs::write(cache_root.join("render/keep.png"), b"keep").unwrap();

        assert!(!validate_existing_render_cache_owner(workspace.path(), &cache_root).unwrap());
        assert_eq!(
            fs::read(cache_root.join("render/keep.png")).unwrap(),
            b"keep"
        );
    }

    #[test]
    fn prepares_khmer_hyphenation_boundaries_as_zws_only() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest_dir
            .join("resources")
            .join("examples")
            .join("03-language-providers")
            .join("02-khmer-segmentation-comparison");
        let source_path = project_root.join("main.typ");
        let source = fs::read_to_string(&source_path).unwrap();
        let segmenter = KhmerTextSegmenter::new().unwrap();
        let cache_root = std::env::temp_dir().join("typsastra-khmer-prepare-scope-test");
        let _ = fs::remove_dir_all(&cache_root);
        let options = RenderPrepareOptions {
            enable_khmer_zws: true,
            project_root: project_root.clone(),
            entry_file: source_path.clone(),
            cache_root: cache_root.clone(),
            generate_source_map: true,
        };

        let prepared_path =
            prepare_single_in_memory_file(&options, Some(&segmenter), &source_path, &source)
                .unwrap();
        let prepared = fs::read_to_string(prepared_path).unwrap();
        let _ = fs::remove_dir_all(&cache_root);

        assert!(
            prepared.contains('\u{200b}'),
            "prepared example should contain ZWSP layout breaks"
        );
        assert!(
            !prepared.contains('\u{00ad}'),
            "Khmer render preparation should not insert SHY"
        );
        assert!(
            !prepared.contains("\u{1780}\u{17d2}\u{1793}\u{17bb}\u{200b}\u{1784}"),
            "prepared example must not split ក្នុង with ZWSP"
        );
    }
}
