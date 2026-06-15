# vhs script for the README demo GIF — regenerate with: vhs docs/demo.tape
# (install vhs: https://github.com/charmbracelet/vhs)
#
# Demos the fast, free, key-free path: `vouch init` + the deterministic layer.
# The agentic pass (which needs ANTHROPIC_API_KEY and ~40s) is shown as text in
# the README — too slow and key-dependent for a snappy GIF.

Output docs/demo.gif

Set FontSize 16
Set Width 1100
Set Height 640
Set Theme "Dracula"
Set Padding 18
Set TypingSpeed 45ms

Type "vouch init"
Enter
Sleep 1500ms

Type "vouch check --no-agent --base HEAD~1 -m 'add retry logic to the fetch client'"
Enter
Sleep 3500ms

Type "# same diff, deterministic layer only — fast, free, no API key"
Sleep 2500ms
