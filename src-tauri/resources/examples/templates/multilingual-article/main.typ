#import "template.typ": multilingual-article

// typstry:typography:start
#set text(font: "MiSans Latin", size: 11pt)
#show regex("\p{Khmer}+"): set text(font: "MiSans Khmer", size: 1em + 0pt)
// typstry:typography:end

#show: multilingual-article.with(
  title: "A Multilingual Article",
  author: "Your Name",
)

#include "sections/introduction.typ"
#include "sections/scripts.typ"
