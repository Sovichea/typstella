#set document(title: "Main and Included Files")
#set page(margin: 24mm)
#set text(font: "New Computer Modern")
#set heading(numbering: "1.")

= Main-document preview ownership

This `main.typ` owns the complete document preview.

#include "chapters/included.typ"

Open the included chapter in Explorer. Its editor tab changes, but the preview
continues to represent this complete main document. Use **Set as Main File** on
`main.typ` if the example was opened without a configured main file.
