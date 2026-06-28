use semver::Version;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const TYPST_RELEASES_URL: &str = "https://api.github.com/repos/typst/typst/releases";
const TINYMIST_RELEASES_URL: &str = "https://api.github.com/repos/Myriad-Dreamin/tinymist/releases";

#[derive(Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Clone)]
struct StableRelease {
    version: Version,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstReleaseInfo {
    version: String,
    published_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatus {
    pub typst_version: Option<String>,
    pub typst_source: Option<String>,
    pub tinymist_version: Option<String>,
    pub tinymist_source: Option<String>,
    pub lsp_available: bool,
    pub message: String,
}

pub fn managed_executable_path(data_dir: &Path, name: &str) -> PathBuf {
    #[cfg(windows)]
    let file_name = format!("{}.exe", name);
    #[cfg(not(windows))]
    let file_name = name.to_string();

    data_dir.join("toolchain").join(file_name)
}

fn legacy_managed_executable_path(data_dir: &Path, name: &str) -> PathBuf {
    #[cfg(windows)]
    let file_name = format!("{}.exe", name);
    #[cfg(not(windows))]
    let file_name = name.to_string();

    data_dir.join(file_name)
}

fn command_for(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn executable_version(executable: &Path) -> Option<Version> {
    let output = command_for(executable).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = format!(
        "{} {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    text.split_whitespace()
        .find_map(|token| Version::parse(token.trim_start_matches('v')).ok())
}

pub fn resolve_executable(data_dir: &Path, name: &str) -> Option<PathBuf> {
    for managed in [
        managed_executable_path(data_dir, name),
        legacy_managed_executable_path(data_dir, name),
    ] {
        if managed.is_file() && executable_version(&managed).is_some() {
            return Some(managed);
        }
    }

    let path_command = PathBuf::from(name);
    executable_version(&path_command).map(|_| path_command)
}

fn source_label(data_dir: &Path, executable: &Path) -> String {
    if executable.starts_with(data_dir) {
        "Managed by Typstry".to_string()
    } else {
        "System PATH".to_string()
    }
}

pub fn status(data_dir: &Path) -> ToolchainStatus {
    let typst = resolve_executable(data_dir, "typst");
    let tinymist = resolve_executable(data_dir, "tinymist");
    let typst_version = typst.as_deref().and_then(executable_version);
    let tinymist_version = tinymist.as_deref().and_then(executable_version);
    let lsp_available = match (&typst_version, &tinymist_version) {
        (Some(typst), Some(tinymist)) => {
            typst.major == tinymist.major && typst.minor == tinymist.minor
        }
        _ => false,
    };
    let message = match (&typst_version, &tinymist_version, lsp_available) {
        (None, _, _) => "Typst is not installed.".to_string(),
        (Some(typst), None, _) => format!(
            "Typst {} is ready. No matching Tinymist release is installed; compiler preview remains available.",
            typst
        ),
        (Some(typst), Some(tinymist), false) => format!(
            "Typst {} and Tinymist {} are incompatible. Compiler preview remains available without LSP or preview sync.",
            typst, tinymist
        ),
        (Some(typst), Some(tinymist), true) => {
            format!("Typst {} and Tinymist {} are ready.", typst, tinymist)
        }
    };

    ToolchainStatus {
        typst_version: typst_version.map(|version| version.to_string()),
        typst_source: typst.as_deref().map(|path| source_label(data_dir, path)),
        tinymist_version: tinymist_version.map(|version| version.to_string()),
        tinymist_source: tinymist.as_deref().map(|path| source_label(data_dir, path)),
        lsp_available,
        message,
    }
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("Typstry/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("Failed to initialize GitHub client: {}", error))
}

async fn fetch_stable_releases(url: &str) -> Result<Vec<StableRelease>, String> {
    let client = github_client()?;
    let mut releases = Vec::new();
    for page in 1.. {
        let response = client
            .get(url)
            .query(&[("per_page", 100), ("page", page)])
            .send()
            .await
            .map_err(|error| format!("Failed to fetch GitHub releases: {}", error))?
            .error_for_status()
            .map_err(|error| format!("GitHub release request failed: {}", error))?;
        let mut page_releases = response
            .json::<Vec<GithubRelease>>()
            .await
            .map_err(|error| format!("Failed to read GitHub releases: {}", error))?;
        let is_last_page = page_releases.len() < 100;
        releases.append(&mut page_releases);
        if is_last_page {
            break;
        }
    }
    let mut stable: Vec<_> = releases.into_iter().filter_map(stable_release).collect();
    stable.sort_by(|left, right| right.version.cmp(&left.version));
    Ok(stable)
}

fn stable_release(release: GithubRelease) -> Option<StableRelease> {
    if release.draft || release.prerelease {
        return None;
    }
    let version = Version::parse(release.tag_name.trim_start_matches('v')).ok()?;
    if !version.pre.is_empty() {
        return None;
    }
    Some(StableRelease {
        version,
        published_at: release.published_at,
        assets: release.assets,
    })
}

pub async fn typst_releases() -> Result<Vec<TypstReleaseInfo>, String> {
    Ok(fetch_stable_releases(TYPST_RELEASES_URL)
        .await?
        .into_iter()
        .map(|release| TypstReleaseInfo {
            version: release.version.to_string(),
            published_at: release.published_at,
        })
        .collect())
}

fn platform_asset_name(tool: &str) -> Result<String, String> {
    let arch = std::env::consts::ARCH;
    let os = std::env::consts::OS;
    match (tool, os, arch) {
        ("typst", "windows", "x86_64") => Ok("typst-x86_64-pc-windows-msvc.zip".into()),
        ("typst", "windows", "aarch64") => Ok("typst-aarch64-pc-windows-msvc.zip".into()),
        ("typst", "macos", "x86_64") => Ok("typst-x86_64-apple-darwin.tar.xz".into()),
        ("typst", "macos", "aarch64") => Ok("typst-aarch64-apple-darwin.tar.xz".into()),
        ("typst", "linux", "x86_64") => Ok("typst-x86_64-unknown-linux-musl.tar.xz".into()),
        ("typst", "linux", "aarch64") => Ok("typst-aarch64-unknown-linux-musl.tar.xz".into()),
        ("tinymist", "windows", "x86_64") => Ok("tinymist-win32-x64.exe".into()),
        ("tinymist", "windows", "aarch64") => Ok("tinymist-win32-arm64.exe".into()),
        ("tinymist", "macos", "x86_64") => Ok("tinymist-darwin-x64".into()),
        ("tinymist", "macos", "aarch64") => Ok("tinymist-darwin-arm64".into()),
        ("tinymist", "linux", "x86_64") => Ok("tinymist-linux-x64".into()),
        ("tinymist", "linux", "aarch64") => Ok("tinymist-linux-arm64".into()),
        _ => Err(format!(
            "No {} binary is published for {} {}.",
            tool, os, arch
        )),
    }
}

async fn download(asset: &GithubAsset) -> Result<Vec<u8>, String> {
    github_client()?
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|error| format!("Failed to download {}: {}", asset.name, error))?
        .error_for_status()
        .map_err(|error| format!("Download failed for {}: {}", asset.name, error))?
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("Failed to read {}: {}", asset.name, error))
}

fn find_executable(root: &Path, name: &str) -> Option<PathBuf> {
    let expected = if cfg!(windows) {
        format!("{}.exe", name)
    } else {
        name.to_string()
    };
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_executable(&path, name) {
                return Some(found);
            }
        } else if path.file_name().and_then(|value| value.to_str()) == Some(&expected) {
            return Some(path);
        }
    }
    None
}

fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(not(unix))]
    let _ = path;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)
            .map_err(|error| format!("Failed to inspect downloaded executable: {}", error))?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)
            .map_err(|error| format!("Failed to mark executable as runnable: {}", error))?;
    }
    Ok(())
}

fn replace_managed_executable(data_dir: &Path, name: &str, source: &Path) -> Result<(), String> {
    let destination = managed_executable_path(data_dir, name);
    let parent = destination.parent().ok_or("Invalid toolchain directory")?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create toolchain directory: {}", error))?;
    let staged = parent.join(format!(
        ".{}.new",
        destination.file_name().unwrap().to_string_lossy()
    ));
    let backup = parent.join(format!(
        ".{}.old",
        destination.file_name().unwrap().to_string_lossy()
    ));
    let _ = std::fs::remove_file(&staged);
    let _ = std::fs::remove_file(&backup);
    std::fs::copy(source, &staged)
        .map_err(|error| format!("Failed to stage {}: {}", name, error))?;
    make_executable(&staged)?;
    if destination.exists() {
        std::fs::rename(&destination, &backup)
            .map_err(|error| format!("Failed to replace existing {}: {}", name, error))?;
    }
    if let Err(error) = std::fs::rename(&staged, &destination) {
        if backup.exists() {
            let _ = std::fs::rename(&backup, &destination);
        }
        return Err(format!("Failed to activate {}: {}", name, error));
    }
    let _ = std::fs::remove_file(backup);
    Ok(())
}

fn install_typst_archive(data_dir: &Path, asset: &GithubAsset, bytes: &[u8]) -> Result<(), String> {
    let extraction = tempfile::tempdir_in(data_dir)
        .map_err(|error| format!("Failed to create extraction directory: {}", error))?;
    if asset.name.ends_with(".zip") {
        let reader = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(reader)
            .map_err(|error| format!("Invalid Typst archive: {}", error))?;
        archive
            .extract(extraction.path())
            .map_err(|error| format!("Failed to extract Typst: {}", error))?;
    } else if asset.name.ends_with(".tar.xz") {
        let decoder = xz2::read::XzDecoder::new(std::io::Cursor::new(bytes));
        let mut archive = tar::Archive::new(decoder);
        archive
            .unpack(extraction.path())
            .map_err(|error| format!("Failed to extract Typst: {}", error))?;
    } else {
        return Err(format!("Unsupported Typst archive: {}", asset.name));
    }
    let executable = find_executable(extraction.path(), "typst")
        .ok_or_else(|| "Downloaded Typst archive did not contain the executable.".to_string())?;
    replace_managed_executable(data_dir, "typst", &executable)
}

async fn install_tinymist_release(data_dir: &Path, release: &StableRelease) -> Result<(), String> {
    let asset_name = platform_asset_name("tinymist")?;
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| format!("Tinymist {} has no {} asset.", release.version, asset_name))?;
    let bytes = download(asset).await?;
    let temporary = tempfile::NamedTempFile::new_in(data_dir)
        .map_err(|error| format!("Failed to stage Tinymist: {}", error))?;
    std::fs::write(temporary.path(), bytes)
        .map_err(|error| format!("Failed to stage Tinymist: {}", error))?;
    replace_managed_executable(data_dir, "tinymist", temporary.path())?;
    let installed = executable_version(&managed_executable_path(data_dir, "tinymist"))
        .ok_or_else(|| "Downloaded Tinymist executable could not be started.".to_string())?;
    if installed != release.version {
        return Err(format!(
            "Downloaded Tinymist reported version {}, expected {}.",
            installed, release.version
        ));
    }
    Ok(())
}

async fn matching_tinymist_release(typst: &Version) -> Result<Option<StableRelease>, String> {
    Ok(fetch_stable_releases(TINYMIST_RELEASES_URL)
        .await?
        .into_iter()
        .find(|release| {
            release.version.major == typst.major && release.version.minor == typst.minor
        }))
}

pub async fn install(data_dir: &Path, requested_version: &str) -> Result<ToolchainStatus, String> {
    let requested = Version::parse(requested_version.trim_start_matches('v'))
        .map_err(|_| format!("Invalid stable Typst version: {}", requested_version))?;
    if !requested.pre.is_empty() {
        return Err("Release candidates and prerelease versions are not supported.".to_string());
    }
    std::fs::create_dir_all(data_dir)
        .map_err(|error| format!("Failed to create app data directory: {}", error))?;
    let releases = fetch_stable_releases(TYPST_RELEASES_URL).await?;
    let release = releases
        .iter()
        .find(|release| release.version == requested)
        .ok_or_else(|| format!("Typst {} is not a stable GitHub release.", requested))?;
    let asset_name = platform_asset_name("typst")?;
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| format!("Typst {} has no {} asset.", requested, asset_name))?;
    let bytes = download(asset).await?;
    install_typst_archive(data_dir, asset, &bytes)?;
    let installed = executable_version(&managed_executable_path(data_dir, "typst"))
        .ok_or_else(|| "Downloaded Typst executable could not be started.".to_string())?;
    if installed != requested {
        return Err(format!(
            "Downloaded Typst reported version {}, expected {}.",
            installed, requested
        ));
    }

    if let Some(tinymist_release) = matching_tinymist_release(&requested).await? {
        install_tinymist_release(data_dir, &tinymist_release).await?;
    }

    Ok(status(data_dir))
}

pub async fn ensure(data_dir: &Path) -> Result<ToolchainStatus, String> {
    let current = status(data_dir);
    let Some(typst_text) = current.typst_version.as_deref() else {
        let latest = fetch_stable_releases(TYPST_RELEASES_URL)
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| "GitHub returned no stable Typst releases.".to_string())?;
        return install(data_dir, &latest.version.to_string()).await;
    };
    if current.lsp_available {
        return Ok(current);
    }

    let typst = Version::parse(typst_text)
        .map_err(|error| format!("Invalid installed Typst version: {}", error))?;
    if let Some(tinymist_release) = matching_tinymist_release(&typst).await? {
        install_tinymist_release(data_dir, &tinymist_release).await?;
    }
    Ok(status(data_dir))
}

pub fn compatible_versions(data_dir: &Path) -> bool {
    status(data_dir).lsp_available
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prerelease_versions_are_not_stable() {
        let release = |tag: &str, prerelease| GithubRelease {
            tag_name: tag.to_string(),
            draft: false,
            prerelease,
            published_at: None,
            assets: vec![],
        };
        assert!(stable_release(release("v0.15.0", false)).is_some());
        assert!(stable_release(release("v0.15.0-rc.1", false)).is_none());
        assert!(stable_release(release("v0.15.0", true)).is_none());
    }

    #[test]
    fn platform_asset_is_supported_for_current_host() {
        assert!(platform_asset_name("typst").is_ok());
        assert!(platform_asset_name("tinymist").is_ok());
    }
}
