mod provider;
mod registry;

pub use registry::{
    analyze_text, complete_language_word, segmentation_prelude, spelling_suggestions,
    SegmentationRegistry,
};
