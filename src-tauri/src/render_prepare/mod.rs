#![allow(unused_imports)]

pub mod mirror;
pub mod scanner;
pub mod segment;
pub mod sourcemap;

pub use mirror::{
    mirror_project_cancellable, prepare_single_in_memory_file,
    validate_existing_render_cache_owner, RenderPrepareOptions, RenderPrepareResult,
    RenderPrepareWarning,
};
pub use segment::KhmerTextSegmenter;
pub use sourcemap::SourceMap;

use std::sync::atomic::{AtomicU64, Ordering};

static RENDER_PREPARATION_EPOCH: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub fn cancel_render_preparation() {
    RENDER_PREPARATION_EPOCH.fetch_add(1, Ordering::AcqRel);
}

#[tauri::command]
pub async fn prepare_render_project(
    options: RenderPrepareOptions,
) -> Result<RenderPrepareResult, String> {
    let epoch = RENDER_PREPARATION_EPOCH.load(Ordering::Acquire);
    tokio::task::spawn_blocking(move || -> Result<RenderPrepareResult, String> {
        let segmenter = if options.enable_khmer_zws {
            Some(KhmerTextSegmenter::new()?)
        } else {
            None
        };
        mirror_project_cancellable(&options, segmenter.as_ref(), || {
            RENDER_PREPARATION_EPOCH.load(Ordering::Acquire) != epoch
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPrepareFileResult {
    pub generated_path: String,
    pub prepared_text: String,
}

#[tauri::command]
pub async fn prepare_render_file(
    options: RenderPrepareOptions,
    file_path: String,
    source_code: String,
) -> Result<RenderPrepareFileResult, String> {
    let epoch = RENDER_PREPARATION_EPOCH.load(Ordering::Acquire);
    tokio::task::spawn_blocking(move || -> Result<RenderPrepareFileResult, String> {
        if RENDER_PREPARATION_EPOCH.load(Ordering::Acquire) != epoch {
            return Err("Render preparation cancelled.".to_string());
        }
        let segmenter = if options.enable_khmer_zws {
            Some(KhmerTextSegmenter::new()?)
        } else {
            None
        };
        let path = std::path::Path::new(&file_path);
        let dest = prepare_single_in_memory_file(&options, segmenter.as_ref(), path, &source_code)?;
        if RENDER_PREPARATION_EPOCH.load(Ordering::Acquire) != epoch {
            return Err("Render preparation cancelled.".to_string());
        }
        let prepared_text = std::fs::read_to_string(&dest).map_err(|e| e.to_string())?;
        Ok(RenderPrepareFileResult {
            generated_path: dest.to_string_lossy().to_string(),
            prepared_text,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn map_generated_to_source(
    cache_root: String,
    relative_path: String,
    generated_offset: usize,
) -> Option<usize> {
    let maps_dir = std::path::Path::new(&cache_root).join("maps");
    let mut map_rel = std::path::PathBuf::from(&relative_path);
    let ext = map_rel
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("typ");
    map_rel.set_extension(format!("{}.map.json", ext));
    let map_path = maps_dir.join(map_rel);

    if let Ok(content) = std::fs::read_to_string(map_path) {
        if let Ok(sourcemap) = serde_json::from_str::<SourceMap>(&content) {
            return sourcemap.generated_to_source(generated_offset);
        }
    }
    None
}

#[tauri::command]
pub fn map_source_to_generated(
    cache_root: String,
    relative_path: String,
    source_offset: usize,
) -> Option<usize> {
    let maps_dir = std::path::Path::new(&cache_root).join("maps");
    let mut map_rel = std::path::PathBuf::from(&relative_path);
    let ext = map_rel
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("typ");
    map_rel.set_extension(format!("{}.map.json", ext));
    let map_path = maps_dir.join(map_rel);

    if let Ok(content) = std::fs::read_to_string(map_path) {
        if let Ok(sourcemap) = serde_json::from_str::<SourceMap>(&content) {
            return sourcemap.source_to_generated(source_offset);
        }
    }
    None
}
