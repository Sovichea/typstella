// Select another compatible family from Document typography if MiSans Khmer is not installed.
// typstry:typography:start
#show regex("\p{Khmer}+"): set text(font: "MiSans Khmer", size: 1em + 0pt)
// typstry:typography:end
#set document(title: "Complex Script Shaping")
#set page(margin: 22mm)
#set text(size: 12pt)
#set par(leading: 0.9em)

= Complex Script Shaping

Complex scripts rely on correct character shaping, combining marks, and font fallback. Do not insert spaces between characters to imitate shaping.

#let sample(name, content) = block(
  width: 100%,
  inset: 11pt,
  radius: 5pt,
  stroke: 0.5pt + luma(185),
  [*#name* \
  #content],
)

#sample("Khmer", [សួស្តី​ពិភពលោក។ អក្សរខ្មែរត្រូវការការរៀបចំតួអក្សរដែលត្រឹមត្រូវ។])

#sample("Lao", [ສະບາຍດີໂລກ. ຕົວອັກສອນລາວຕ້ອງການການຈັດຮູບຮ່າງທີ່ຖືກຕ້ອງ.])

#sample("Devanagari", [नमस्ते दुनिया। देवनागरी में अक्षरों और मात्राओं का सही संयोजन आवश्यक है।])

#sample("Bengali", [নমস্কার বিশ্ব। বাংলা অক্ষর ও মাত্রার সঠিক বিন্যাস গুরুত্বপূর্ণ।])

#sample("Myanmar", [မင်္ဂလာပါ ကမ္ဘာ။ မြန်မာစာလုံးများ မှန်ကန်စွာ ပုံဖော်ရန် လိုအပ်သည်။])

== Script-specific sizing

The toolbar can generate a rule like this when one script needs a small optical size adjustment:

```typ
#show regex("\p{Khmer}+"): set text(
  font: "Your preferred Khmer font",
  size: 1em + 0.5pt,
)
```
