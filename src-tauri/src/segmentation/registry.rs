use super::provider::{
    CompletionRequest, CompletionResponse, LanguageSegmenter, RenderReplacement, SegmentToken,
    TextAnalysis,
};
use khmer_segmenter::kdict::{KDict, KHypDict};
use khmer_segmenter::{KhmerSegmenter, SegmenterConfig};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

const KHMER_DICTIONARY: &[u8] =
    include_bytes!("../../../third_party/khmer_segmenter/port/common/khmer_dictionary.kdict");
const KHMER_WORDS: &str = include_str!(
    "../../../third_party/khmer_segmenter/khmer_segmenter/dictionary_data/khmer_dictionary_words.txt"
);
const KHMER_HYPHENATION: &[u8] =
    include_bytes!("../../../third_party/khmer_segmenter/port/common/khmer_hyphenation.kdict");

struct KhmerProvider {
    segmenter: KhmerSegmenter,
    lookup_words: Vec<String>,
    known: HashSet<String>,
    completion_costs: HashMap<String, f32>,
    hyphenation: KHypDict,
}

impl KhmerProvider {
    fn new() -> Result<Self, String> {
        let segmenter =
            KhmerSegmenter::from_bytes(KHMER_DICTIONARY.to_vec(), SegmenterConfig::default())
                .map_err(|error| format!("Failed to load Khmer dictionary: {error}"))?;
        let mut words: Vec<String> = KHMER_WORDS
            .lines()
            .map(str::trim)
            .filter(|word| !word.is_empty())
            .map(str::to_owned)
            .collect();
        words.sort();
        words.dedup();
        let hyphenation = KHypDict::from_bytes(KHMER_HYPHENATION.to_vec())
            .map_err(|error| format!("Failed to load Khmer hyphenation dictionary: {error}"))?;
        let completion_dictionary = KDict::from_bytes(KHMER_DICTIONARY.to_vec())
            .map_err(|error| format!("Failed to load Khmer completion dictionary: {error}"))?;
        let mut completion_costs = HashMap::<String, f32>::new();
        for word in &words {
            let key = modern_khmer_key(word);
            let cost = completion_dictionary.cost(word).unwrap_or(f32::MAX);
            completion_costs
                .entry(key)
                .and_modify(|current| *current = current.min(cost))
                .or_insert(cost);
        }
        let mut lookup_words: Vec<String> = completion_costs.keys().cloned().collect();
        lookup_words.sort();
        let known = lookup_words.iter().cloned().collect();
        Ok(Self {
            segmenter,
            lookup_words,
            known,
            completion_costs,
            hyphenation,
        })
    }

    fn has_prefix(&self, prefix: &str) -> bool {
        let prefix = modern_khmer_key(prefix);
        let index = self
            .lookup_words
            .partition_point(|candidate| candidate.as_str() < prefix.as_str());
        self.lookup_words
            .get(index)
            .is_some_and(|candidate| candidate.starts_with(&prefix))
    }
}

/// Modern Khmer renders COENG+DA and COENG+TA identically. Use COENG+TA as
/// the provider's comparison key while retaining the original source text.
fn modern_khmer_key(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut characters = text.chars().peekable();
    while let Some(character) = characters.next() {
        output.push(character);
        if character == '\u{17d2}' && characters.peek() == Some(&'\u{178a}') {
            characters.next();
            output.push('\u{178f}');
        }
    }
    output
}

fn edit_distance(left: &str, right: &str) -> usize {
    let right_chars: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=right_chars.len()).collect();
    for (left_index, left_char) in left.chars().enumerate() {
        let mut current = vec![left_index + 1];
        for (right_index, right_char) in right_chars.iter().enumerate() {
            current.push(
                (previous[right_index + 1] + 1)
                    .min(current[right_index] + 1)
                    .min(previous[right_index] + usize::from(left_char != *right_char)),
            );
        }
        previous = current;
    }
    previous[right_chars.len()]
}

impl LanguageSegmenter for KhmerProvider {
    fn id(&self) -> &'static str {
        "khmer-segmenter"
    }

    fn pattern(&self) -> &'static str {
        "[\u{1780}-\u{17ff}]+"
    }

    fn supports(&self, text: &str) -> bool {
        text.chars()
            .any(|character| ('\u{1780}'..='\u{17ff}').contains(&character))
    }

    fn analyze(&self, text: &str) -> Result<TextAnalysis, String> {
        let result = self
            .segmenter
            .segment_detailed(text)
            .map_err(|error| error.to_string())?;
        let normalized = result.normalized();
        let clean_text: String = text
            .chars()
            .filter(|&c| c != '\u{200b}' && c != '\u{200c}' && c != '\u{200d}')
            .collect();
        let normalized_changed = normalized != clean_text;
        let mut byte_to_utf16 = vec![0; text.len() + 1];
        let mut utf16_offset = 0;
        for (byte_offset, character) in text.char_indices() {
            byte_to_utf16[byte_offset] = utf16_offset;
            utf16_offset += character.len_utf16();
        }
        byte_to_utf16[text.len()] = utf16_offset;
        let is_spelling_char = |character: char| ('\u{1780}'..='\u{17d3}').contains(&character);
        let tokens = result
            .mapped_segments()
            .iter()
            .map(|segment| {
                let token = &normalized[segment.normalized_range.clone()];
                let lookup_key = modern_khmer_key(token);
                let known =
                    !token.chars().any(is_spelling_char) || self.known.contains(&lookup_key);
                SegmentToken {
                    text: token.to_owned(),
                    from: byte_to_utf16[segment.source_range.start],
                    to: byte_to_utf16[segment.source_range.end],
                    known,
                    known_prefix: known || self.has_prefix(token),
                }
            })
            .collect();
        Ok(TextAnalysis {
            provider: self.id(),
            normalized_changed,
            tokens,
        })
    }

    fn suggestions(&self, word: &str, limit: usize) -> Vec<String> {
        if word.is_empty() || limit == 0 {
            return Vec::new();
        }
        let word = modern_khmer_key(word);
        let prefix_index = self
            .lookup_words
            .partition_point(|candidate| candidate.as_str() < word.as_str());
        let mut suggestions: Vec<String> = self
            .lookup_words
            .iter()
            .skip(prefix_index)
            .take_while(|candidate| candidate.starts_with(&word))
            .filter(|candidate| candidate.as_str() != word.as_str())
            .take(limit)
            .cloned()
            .collect();
        if suggestions.len() == limit {
            return suggestions;
        }

        let first = word.chars().next();
        let length = word.chars().count();
        let mut candidates: Vec<(usize, &str)> = self
            .lookup_words
            .iter()
            .map(String::as_str)
            .filter(|candidate| candidate.chars().next() == first)
            .filter(|candidate| candidate.chars().count().abs_diff(length) <= 2)
            .map(|candidate| (edit_distance(&word, candidate), candidate))
            .filter(|(distance, _)| *distance <= 3)
            .collect();
        candidates.sort_by(|left, right| {
            left.0
                .cmp(&right.0)
                .then_with(|| left.1.len().cmp(&right.1.len()))
        });
        candidates.dedup_by(|left, right| left.1 == right.1);
        for candidate in candidates.into_iter().map(|(_, candidate)| candidate) {
            if suggestions.iter().any(|suggestion| suggestion == candidate) {
                continue;
            }
            suggestions.push(candidate.to_owned());
            if suggestions.len() == limit {
                break;
            }
        }
        if suggestions.is_empty() {
            let mut fallback: Vec<(usize, &str)> = self
                .lookup_words
                .iter()
                .map(String::as_str)
                .filter(|candidate| candidate.chars().count().abs_diff(length) <= 2)
                .map(|candidate| (edit_distance(&word, candidate), candidate))
                .filter(|(distance, _)| *distance <= 3)
                .collect();
            fallback.sort_by(|left, right| {
                left.0
                    .cmp(&right.0)
                    .then_with(|| left.1.chars().count().cmp(&right.1.chars().count()))
                    .then_with(|| left.1.cmp(right.1))
            });
            fallback.dedup_by(|left, right| left.1 == right.1);
            suggestions.extend(
                fallback
                    .into_iter()
                    .take(limit)
                    .map(|(_, candidate)| candidate.to_owned()),
            );
        }
        suggestions
    }

    fn autocomplete(&self, prefix: &str, limit: usize) -> Vec<String> {
        if prefix.is_empty() {
            return Vec::new();
        }
        let prefix = modern_khmer_key(prefix);
        let index = self
            .lookup_words
            .partition_point(|candidate| candidate.as_str() < prefix.as_str());
        let mut candidates: Vec<_> = self
            .lookup_words
            .iter()
            .skip(index)
            .take_while(|candidate| candidate.starts_with(&prefix))
            .filter(|candidate| candidate.as_str() != prefix.as_str())
            .map(|candidate| {
                (
                    self.completion_costs
                        .get(candidate)
                        .copied()
                        .unwrap_or(f32::MAX),
                    candidate.chars().count(),
                    candidate,
                )
            })
            .collect();
        candidates.sort_by(|left, right| {
            left.0
                .total_cmp(&right.0)
                .then_with(|| left.1.cmp(&right.1))
                .then_with(|| left.2.cmp(right.2))
        });
        candidates
            .into_iter()
            .take(limit)
            .map(|(_, _, candidate)| candidate.clone())
            .collect()
    }

    fn render_replacements(&self, text: &str) -> Vec<RenderReplacement> {
        let mut runs = Vec::new();
        let mut start = None;
        for (index, character) in text.char_indices() {
            let is_khmer = ('\u{1780}'..='\u{17ff}').contains(&character);
            match (start, is_khmer) {
                (None, true) => start = Some(index),
                (Some(from), false) => {
                    runs.push(&text[from..index]);
                    start = None;
                }
                _ => {}
            }
        }
        if let Some(from) = start {
            runs.push(&text[from..]);
        }

        runs.into_iter()
            .filter_map(|source| {
                let segmentation = self.segmenter.segment_detailed(source).ok()?;
                if segmentation.normalized() != source {
                    return None;
                }
                let segmented = segmentation.join("\u{200b}");
                let hyphenated = segmentation
                    .tokens()
                    .map(|token| {
                        self.hyphenation
                            .lookup(token)
                            .map(|value| value.replace('\u{200b}', "\u{00ad}"))
                            .unwrap_or_else(|| token.to_owned())
                    })
                    .collect::<Vec<_>>()
                    .join("\u{200b}");
                (segmented != source || hyphenated != source).then(|| RenderReplacement {
                    source: source.to_owned(),
                    segmented,
                    hyphenated,
                })
            })
            .collect()
    }
}

pub struct SegmentationRegistry {
    providers: Vec<Arc<dyn LanguageSegmenter>>,
    cache: Arc<
        std::sync::Mutex<
            std::collections::HashMap<
                std::path::PathBuf,
                (std::time::SystemTime, Vec<Vec<RenderReplacement>>),
            >,
        >,
    >,
}

fn collect_replacements(
    root: &std::path::Path,
    active_path: &std::path::Path,
    active_contents: &str,
    providers: &[Arc<dyn LanguageSegmenter>],
    cache: &std::sync::Mutex<
        std::collections::HashMap<
            std::path::PathBuf,
            (std::time::SystemTime, Vec<Vec<RenderReplacement>>),
        >,
    >,
    all_replacements: &mut Vec<Vec<RenderReplacement>>,
) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name();
            if name != ".git" && name != "target" && name != "node_modules" {
                collect_replacements(
                    &path,
                    active_path,
                    active_contents,
                    providers,
                    cache,
                    all_replacements,
                );
            }
        } else if path.extension().and_then(|extension| extension.to_str()) == Some("typ")
            && !path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .contains("typstry-preview")
        {
            let is_active = path.to_string_lossy().to_lowercase()
                == active_path.to_string_lossy().to_lowercase();
            if is_active {
                let replacements: Vec<Vec<RenderReplacement>> = providers
                    .iter()
                    .map(|provider| provider.render_replacements(active_contents))
                    .collect();
                for (i, reps) in replacements.into_iter().enumerate() {
                    all_replacements[i].extend(reps);
                }
            } else {
                let modified = std::fs::metadata(&path)
                    .and_then(|m| m.modified())
                    .unwrap_or_else(|_| std::time::SystemTime::now());

                let cached_reps = {
                    let lock = cache.lock().unwrap();
                    if let Some((time, cached)) = lock.get(&path) {
                        if *time == modified {
                            Some(cached.clone())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                };

                let replacements = if let Some(reps) = cached_reps {
                    reps
                } else if let Ok(source) = std::fs::read_to_string(&path) {
                    let reps: Vec<Vec<RenderReplacement>> = providers
                        .iter()
                        .map(|provider| provider.render_replacements(&source))
                        .collect();
                    let mut lock = cache.lock().unwrap();
                    lock.insert(path.clone(), (modified, reps.clone()));
                    reps
                } else {
                    continue;
                };

                for (i, reps) in replacements.into_iter().enumerate() {
                    all_replacements[i].extend(reps);
                }
            }
        }
    }
}

fn typst_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_owned())
}

impl SegmentationRegistry {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            providers: vec![Arc::new(KhmerProvider::new()?)],
            cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        })
    }
}

#[tauri::command]
pub async fn analyze_text(
    registry: tauri::State<'_, SegmentationRegistry>,
    text: String,
) -> Result<Option<TextAnalysis>, String> {
    let providers = registry.providers.clone();
    tokio::task::spawn_blocking(move || -> Result<Option<TextAnalysis>, String> {
        let provider = providers.iter().find(|provider| provider.supports(&text));

        if let Some(provider) = provider {
            provider.analyze(&text).map(Some)
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spelling_suggestions(
    registry: tauri::State<'_, SegmentationRegistry>,
    word: String,
    limit: Option<usize>,
) -> Result<Vec<String>, String> {
    let providers = registry.providers.clone();
    tokio::task::spawn_blocking(move || -> Vec<String> {
        let provider = providers.iter().find(|provider| provider.supports(&word));

        if let Some(provider) = provider {
            provider.suggestions(&word, limit.unwrap_or(5).min(10))
        } else {
            Vec::new()
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn complete_language_word(
    registry: tauri::State<'_, SegmentationRegistry>,
    request: CompletionRequest,
) -> Result<Option<CompletionResponse>, String> {
    let providers = registry.providers.clone();
    tokio::task::spawn_blocking(move || -> Result<Option<CompletionResponse>, String> {
        let Some(provider) = providers
            .iter()
            .find(|provider| provider.supports(&request.text))
        else {
            return Ok(None);
        };
        complete_with_provider(provider.as_ref(), &request)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn complete_with_provider(
    provider: &dyn LanguageSegmenter,
    request: &CompletionRequest,
) -> Result<Option<CompletionResponse>, String> {
    let analysis = provider.analyze(&request.text)?;
    let Some(end_index) = analysis
        .tokens
        .iter()
        .rposition(|token| token.from < request.cursor_utf16 && token.to == request.cursor_utf16)
    else {
        return Ok(None);
    };
    // Khmer compounds can be segmented into an already-known word plus the
    // newly typed suffix. Try the longest recent token sequence first so a
    // prefix such as `សាលា` + `រ` remains `សាលារ`, not merely `រ`.
    let first_index = end_index.saturating_sub(3);
    for start_index in first_index..=end_index {
        let prefix = analysis.tokens[start_index..=end_index]
            .iter()
            .map(|token| token.text.as_str())
            .collect::<String>();
        let options = provider.autocomplete(&prefix, request.limit.min(50));
        if !options.is_empty() {
            return Ok(Some(CompletionResponse {
                provider: provider.id().to_owned(),
                from: analysis.tokens[start_index].from,
                to: request.cursor_utf16,
                options,
            }));
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn segmentation_prelude(
    registry: tauri::State<'_, SegmentationRegistry>,
    workspace_root_path: String,
    active_file_path: String,
    active_contents: String,
) -> Result<String, String> {
    let providers = registry.providers.clone();
    let cache = registry.cache.clone();

    tokio::task::spawn_blocking(move || -> String {
        let mut all_replacements = vec![Vec::new(); providers.len()];
        collect_replacements(
            &PathBuf::from(workspace_root_path),
            &PathBuf::from(active_file_path),
            &active_contents,
            &providers,
            &cache,
            &mut all_replacements,
        );

        let mut prelude = String::new();
        for (index, provider) in providers.iter().enumerate() {
            let mut replacements = std::mem::take(&mut all_replacements[index]);
            replacements.sort_by(|left, right| left.source.cmp(&right.source));
            replacements.dedup_by(|left, right| left.source == right.source);

            if replacements.is_empty() {
                continue;
            }

            let dict_entries = replacements
                .into_iter()
                .map(|replacement| {
                    format!(
                        "{}: ({}, {}),",
                        typst_string(&replacement.source),
                        typst_string(&replacement.hyphenated),
                        typst_string(&replacement.segmented),
                    )
                })
                .collect::<Vec<_>>()
                .join("\n  ");

            prelude.push_str(&format!(
                "#let __typstry_segs_{} = (\n  {}\n)\n",
                index, dict_entries
            ));
            prelude.push_str(&format!(
                "#show regex({}): it => {{\n  if it.text in __typstry_segs_{} {{\n    let rep = __typstry_segs_{}.at(it.text)\n    text(rep.at(1))\n  }} else {{\n    it\n  }}\n}}\n",
                typst_string(provider.pattern()), index, index
            ));
        }
        prelude
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refreshes_and_ranks_school_completion_for_each_prefix() {
        let provider = KhmerProvider::new().unwrap();
        for prefix in ["ស", "សា", "សាល", "សាលា", "សាលារ"] {
            let response = complete_with_provider(
                &provider,
                &CompletionRequest {
                    text: prefix.into(),
                    cursor_utf16: prefix.encode_utf16().count(),
                    limit: 10,
                },
            )
            .unwrap()
            .expect("completion response");
            assert!(!response.options.iter().any(|option| option == prefix));
        }
        let response = complete_with_provider(
            &provider,
            &CompletionRequest {
                text: "សាលា".into(),
                cursor_utf16: "សាលា".encode_utf16().count(),
                limit: 10,
            },
        )
        .unwrap()
        .expect("school completion");
        assert_eq!(
            response.options.first().map(String::as_str),
            Some("សាលារៀន")
        );
        let continued = complete_with_provider(
            &provider,
            &CompletionRequest {
                text: "សាលារ".into(),
                cursor_utf16: "សាលារ".encode_utf16().count(),
                limit: 10,
            },
        )
        .unwrap()
        .expect("continued school completion");
        assert_eq!(continued.from, 0);
        assert_eq!(
            continued.options.first().map(String::as_str),
            Some("សាលារៀន")
        );
    }

    #[test]
    fn analyzes_khmer_with_editor_safe_ranges() {
        let provider = KhmerProvider::new().expect("Khmer provider");
        let analysis = provider.analyze("ក្រុមហ៊ុនទទួលបានប្រាក់ចំណូល").expect("analysis");
        assert!(!analysis.normalized_changed);
        assert!(!analysis.tokens.is_empty());
        assert!(analysis.tokens.iter().all(|token| token.from <= token.to));
    }

    #[test]
    fn preserves_source_ranges_through_normalization_and_utf16_conversion() {
        let provider = KhmerProvider::new().expect("Khmer provider");
        let source = "\u{1f600}\u{1780}\u{17c6}\u{17b6}";
        let analysis = provider.analyze(source).expect("analysis");
        assert!(analysis.normalized_changed);
        let khmer_tokens: Vec<_> = analysis
            .tokens
            .iter()
            .filter(|token| {
                token
                    .text
                    .chars()
                    .any(|character| ('\u{1780}'..='\u{17ff}').contains(&character))
            })
            .collect();
        assert!(!khmer_tokens.is_empty());
        assert_eq!(khmer_tokens.first().unwrap().from, 2);
        assert_eq!(khmer_tokens.last().unwrap().to, 5);

        let composed = provider
            .analyze("\u{1f600}\u{1780}\u{17c1}\u{17b8}")
            .expect("composed vowel analysis");
        assert!(composed.normalized_changed);
        assert!(composed
            .tokens
            .iter()
            .any(|token| token.from == 2 && token.to == 5));
    }

    #[test]
    fn preserves_ranges_across_removed_joiners() {
        let provider = KhmerProvider::new().expect("Khmer provider");
        for joiner in ['\u{200b}', '\u{200c}', '\u{200d}'] {
            let source = format!("\u{1f600}\u{1780}{joiner}\u{17b6}");
            let analysis = provider.analyze(&source).expect("joiner analysis");
            assert!(analysis
                .tokens
                .iter()
                .any(|token| token.from == 2 && token.to == 5));
        }
    }

    #[test]
    fn treats_modern_coeng_ta_and_legacy_coeng_da_as_equivalent() {
        let provider = KhmerProvider::new().expect("Khmer provider");
        let legacy = "គ្របដណ\u{17d2}\u{178a}ប់";
        let modern = "គ្របដណ\u{17d2}\u{178f}ប់";
        assert_eq!(modern_khmer_key(legacy), modern);
        for spelling in [legacy, modern] {
            let analysis = provider.analyze(spelling).expect("analysis");
            assert!(analysis.tokens.iter().all(|token| token.known));
            assert_eq!(analysis.tokens.first().unwrap().from, 0);
            assert_eq!(
                analysis.tokens.last().unwrap().to,
                spelling.encode_utf16().count()
            );
        }
    }

    #[test]
    fn completes_the_last_segment_in_an_unspaced_run() {
        let provider = KhmerProvider::new().expect("Khmer provider");
        let prefix = provider
            .lookup_words
            .iter()
            .find_map(|word| {
                let prefix: String = word.chars().take(1).collect();
                (!prefix.is_empty() && !provider.known.contains(&prefix)).then_some(prefix)
            })
            .expect("completion prefix");
        let response = provider.lookup_words.iter().take(200).find_map(|first| {
            let text = format!("{first}{prefix}");
            let request = CompletionRequest {
                cursor_utf16: text.encode_utf16().count(),
                text,
                limit: 10,
            };
            complete_with_provider(&provider, &request)
                .expect("completion")
                .filter(|response| response.from == first.encode_utf16().count())
                .map(|response| (first, response))
        });
        let (first, _) =
            response.expect("no dictionary pair produced a segmented suffix completion");
        let punctuated = format!("{first}\u{17d4}{prefix}");
        let response = complete_with_provider(
            &provider,
            &CompletionRequest {
                cursor_utf16: punctuated.encode_utf16().count(),
                text: punctuated,
                limit: 10,
            },
        )
        .expect("punctuated completion")
        .expect("completion after punctuation");
        assert_eq!(response.from, first.encode_utf16().count() + 1);
        assert!(!response.options.is_empty());
    }

    #[test]
    fn emits_discretionary_hyphenation_for_typst() {
        let provider = KhmerProvider::new().expect("Khmer provider");
        let replacements = provider.render_replacements("កក្រើករំជួល");
        assert!(replacements
            .iter()
            .any(|replacement| replacement.hyphenated.contains('\u{00ad}')));
    }

    #[test]
    fn suggests_completions_for_an_unknown_dictionary_prefix() {
        let provider = KhmerProvider::new().expect("Khmer provider");
        let (prefix, full_word) = provider
            .lookup_words
            .iter()
            .find_map(|word| {
                let prefix: String = word.chars().take(1).collect();
                (!prefix.is_empty() && !provider.known.contains(&prefix))
                    .then(|| (prefix, word.clone()))
            })
            .expect("dictionary word with an unknown short prefix");
        assert!(provider
            .suggestions(&prefix, 10)
            .contains(&modern_khmer_key(&full_word)));
    }
}
