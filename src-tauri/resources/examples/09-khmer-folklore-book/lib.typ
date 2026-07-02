#let segmenter = plugin("typst_khmer_plugin.wasm")

#let segment(text) = {
  str(segmenter.segment(bytes(text)))
}

#let apply-khmer-segmentation(body) = {
  show regex("[\u1780-\u17ff]+"): it => segment(it.text)
  body
}
