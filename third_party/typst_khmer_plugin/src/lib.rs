use khmer_segmenter::{KhmerSegmenter, SegmenterConfig};
use once_cell::sync::Lazy;
use wasm_minimal_protocol::*;

initiate_protocol!();

const KHMER_DICTIONARY: &[u8] =
    include_bytes!("../../khmer_segmenter/port/common/khmer_dictionary.kdict");

static SEGMENTER: Lazy<KhmerSegmenter> = Lazy::new(|| {
    KhmerSegmenter::from_bytes(KHMER_DICTIONARY.to_vec(), SegmenterConfig::default())
        .expect("Failed to load dictionary in WASM plugin")
});

#[wasm_func]
pub fn segment(text: &[u8]) -> Vec<u8> {
    let input = std::str::from_utf8(text).unwrap_or("");
    let result = SEGMENTER.segment(input, Some("\u{200B}"));
    result.into_bytes()
}
