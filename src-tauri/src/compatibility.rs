use serde::Serialize;
#[cfg(target_os = "linux")]
use std::path::{Path, PathBuf};

#[cfg(target_os = "linux")]
const APP_IDENTIFIER: &str = "com.typsastra.editor";
#[cfg(target_os = "linux")]
const DMABUF_ENVIRONMENT_VARIABLE: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
#[cfg(target_os = "linux")]
const DMABUF_APPLIED_BY_TYPSASTRA: &str = "TYPSASTRA_DMABUF_SETTING_APPLIED";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinuxRendererCompatibility {
    supported: bool,
    session_type: Option<String>,
    wayland: bool,
    webkit_version: Option<String>,
    distribution: Option<String>,
    architecture: String,
    gpu_vendor: Option<String>,
    amd_gpu: bool,
    risk_level: &'static str,
    dmabuf_disabled: bool,
    dmabuf_environment_value: Option<String>,
    dmabuf_applied_by_typsastra: bool,
}

pub fn configure_process_environment() {
    #[cfg(target_os = "linux")]
    {
        let Some(path) = early_settings_file_path() else {
            return;
        };
        if disable_dmabuf_from_settings(&path) {
            let supplied_externally = environment_string(DMABUF_ENVIRONMENT_VARIABLE)
                .as_deref()
                .is_some_and(environment_flag_enabled)
                && std::env::var_os(DMABUF_APPLIED_BY_TYPSASTRA).is_none();
            std::env::set_var(DMABUF_ENVIRONMENT_VARIABLE, "1");
            if !supplied_externally {
                std::env::set_var(DMABUF_APPLIED_BY_TYPSASTRA, "1");
            }
        }
    }
}

#[tauri::command]
pub fn prepare_linux_renderer_relaunch(disable_dmabuf: bool) {
    #[cfg(target_os = "linux")]
    {
        if disable_dmabuf {
            if std::env::var_os(DMABUF_ENVIRONMENT_VARIABLE).is_none() {
                std::env::set_var(DMABUF_APPLIED_BY_TYPSASTRA, "1");
            }
            std::env::set_var(DMABUF_ENVIRONMENT_VARIABLE, "1");
        } else if environment_string(DMABUF_APPLIED_BY_TYPSASTRA)
            .as_deref()
            .is_some_and(environment_flag_enabled)
        {
            std::env::remove_var(DMABUF_ENVIRONMENT_VARIABLE);
            std::env::remove_var(DMABUF_APPLIED_BY_TYPSASTRA);
        }
    }

    #[cfg(not(target_os = "linux"))]
    let _ = disable_dmabuf;
}

#[tauri::command]
pub fn get_linux_renderer_compatibility() -> LinuxRendererCompatibility {
    #[cfg(target_os = "linux")]
    {
        let session_type = environment_string("XDG_SESSION_TYPE");
        let wayland = session_type
            .as_deref()
            .is_some_and(|value| value.eq_ignore_ascii_case("wayland"))
            || std::env::var_os("WAYLAND_DISPLAY").is_some();
        let webkit_version = detect_webkitgtk_version();
        let amd_gpu = has_amd_drm_device();
        let risk_level = renderer_risk_level(wayland, amd_gpu, webkit_version.as_deref());
        let dmabuf_environment_value = environment_string(DMABUF_ENVIRONMENT_VARIABLE);

        LinuxRendererCompatibility {
            supported: true,
            session_type,
            wayland,
            webkit_version,
            distribution: linux_distribution(),
            architecture: std::env::consts::ARCH.to_string(),
            gpu_vendor: amd_gpu.then(|| "AMD".to_string()),
            amd_gpu,
            risk_level,
            dmabuf_disabled: dmabuf_environment_value
                .as_deref()
                .is_some_and(environment_flag_enabled),
            dmabuf_environment_value,
            dmabuf_applied_by_typsastra: environment_string(DMABUF_APPLIED_BY_TYPSASTRA)
                .as_deref()
                .is_some_and(environment_flag_enabled),
        }
    }

    #[cfg(not(target_os = "linux"))]
    LinuxRendererCompatibility {
        supported: false,
        session_type: None,
        wayland: false,
        webkit_version: None,
        distribution: None,
        architecture: std::env::consts::ARCH.to_string(),
        gpu_vendor: None,
        amd_gpu: false,
        risk_level: "none",
        dmabuf_disabled: false,
        dmabuf_environment_value: None,
        dmabuf_applied_by_typsastra: false,
    }
}

#[cfg(any(target_os = "linux", test))]
fn environment_flag_enabled(value: &str) -> bool {
    !matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "0" | "false" | "no" | "off"
    )
}

#[cfg(target_os = "linux")]
fn environment_string(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

#[cfg(target_os = "linux")]
fn early_settings_file_path() -> Option<PathBuf> {
    if let Some(path) = environment_string("TYPSASTRA_SETTINGS_PATH") {
        return Some(PathBuf::from(path));
    }
    linux_config_root(
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from),
        std::env::var_os("HOME").map(PathBuf::from),
    )
    .map(|root| root.join(APP_IDENTIFIER).join("settings.json"))
}

#[cfg(target_os = "linux")]
fn linux_config_root(xdg_config_home: Option<PathBuf>, home: Option<PathBuf>) -> Option<PathBuf> {
    xdg_config_home
        .filter(|path| path.is_absolute())
        .or_else(|| home.map(|path| path.join(".config")))
}

#[cfg(target_os = "linux")]
fn disable_dmabuf_from_settings(path: &Path) -> bool {
    std::fs::read(path)
        .ok()
        .is_some_and(|bytes| disable_dmabuf_from_settings_bytes(&bytes))
}

#[cfg(any(target_os = "linux", test))]
fn disable_dmabuf_from_settings_bytes(bytes: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Value>(bytes)
        .ok()
        .and_then(|settings| {
            settings
                .pointer("/compatibility/disableWebkitDmabufRenderer")
                .and_then(serde_json::Value::as_bool)
        })
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn detect_webkitgtk_version() -> Option<String> {
    command_output("pkg-config", &["--modversion", "webkit2gtk-4.1"]).or_else(|| {
        command_output(
            "dpkg-query",
            &["-W", "-f=${Version}", "libwebkit2gtk-4.1-0"],
        )
        .map(|version| version.split('-').next().unwrap_or(&version).to_string())
    })
}

#[cfg(target_os = "linux")]
fn command_output(program: &str, arguments: &[&str]) -> Option<String> {
    let output = std::process::Command::new(program)
        .args(arguments)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "linux")]
fn has_amd_drm_device() -> bool {
    std::fs::read_dir("/sys/class/drm")
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("card"))
        .any(|entry| {
            std::fs::read_to_string(entry.path().join("device/vendor"))
                .ok()
                .is_some_and(|vendor| vendor.trim().eq_ignore_ascii_case("0x1002"))
        })
}

#[cfg(target_os = "linux")]
fn linux_distribution() -> Option<String> {
    let contents = std::fs::read_to_string("/etc/os-release").ok()?;
    contents.lines().find_map(|line| {
        line.strip_prefix("PRETTY_NAME=")
            .map(|value| value.trim().trim_matches('"').to_string())
    })
}

#[cfg(any(target_os = "linux", test))]
fn renderer_risk_level(wayland: bool, amd_gpu: bool, webkit_version: Option<&str>) -> &'static str {
    if wayland && amd_gpu && webkit_version.is_some_and(|version| version.starts_with("2.52.")) {
        "reported"
    } else if wayland {
        "possible"
    } else {
        "none"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_the_reported_wayland_amd_profile() {
        assert_eq!(renderer_risk_level(true, true, Some("2.52.3")), "reported");
        assert_eq!(renderer_risk_level(true, false, Some("2.52.3")), "possible");
        assert_eq!(renderer_risk_level(false, true, Some("2.52.3")), "none");
    }

    #[test]
    fn recognizes_environment_switch_values() {
        assert!(environment_flag_enabled("1"));
        assert!(environment_flag_enabled("true"));
        assert!(!environment_flag_enabled("0"));
        assert!(!environment_flag_enabled("off"));
    }

    #[test]
    fn reads_the_early_renderer_setting_without_frontend_migration() {
        assert!(disable_dmabuf_from_settings_bytes(
            br#"{"compatibility":{"disableWebkitDmabufRenderer":true}}"#,
        ));
        assert!(!disable_dmabuf_from_settings_bytes(
            br#"{"compatibility":{"disableWebkitDmabufRenderer":false}}"#,
        ));
        assert!(!disable_dmabuf_from_settings_bytes(b"not json"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn resolves_the_tauri_application_config_directory() {
        assert_eq!(
            linux_config_root(
                Some(PathBuf::from("/tmp/config")),
                Some(PathBuf::from("/home/me"))
            ),
            Some(PathBuf::from("/tmp/config")),
        );
        assert_eq!(
            linux_config_root(None, Some(PathBuf::from("/home/me"))),
            Some(PathBuf::from("/home/me/.config")),
        );
    }
}
