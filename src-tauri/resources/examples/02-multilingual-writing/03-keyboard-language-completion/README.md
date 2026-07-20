# Keyboard-language completion

Purpose: demonstrate that typing suggestions and spellcheck have different
language sources.

Prerequisites: enable typing suggestions and select **Keyboard language** as the
suggestion source. Install the provider for the keyboard language you test.

Expected behavior: switching a reliably mapped OS keyboard changes completion
suggestions only. The English and French spellcheck scopes remain authoritative.
Unsupported keyboard mappings fall back according to the platform status shown
in Settings.

Tutorial: <https://github.com/Sovichea/typsastra/blob/main/docs/tutorials/KEYBOARD_LANGUAGE_COMPLETION.md>
