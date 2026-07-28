/** Shared between the generated .shortcut file's own name and the in-app
 * setup steps ("Select {name}") — they must match exactly, since the user
 * has to pick this shortcut by name inside the real Shortcuts app. */
export function shortcutWorkflowName(code: string): string {
  return `Open Shohaz Bin — ${code}`;
}

/**
 * Builds a minimal Apple Shortcuts workflow (a single "Open URLs" action)
 * as an XML property list. Apple's Shortcuts app accepts plists in either
 * binary or XML serialization — they're the same format, just encoded
 * differently — and this shape (WFWorkflowActions/WFWorkflowActionIdentifier
 * etc.) matches what real exported .shortcut files contain. Not verified
 * against a real device/Shortcuts import in this environment — there's no
 * iPhone or Shortcuts app available here, the same hardware-verification
 * gap as Web NFC itself.
 */
export function buildOpenUrlShortcutPlist({ name, url }: { name: string; url: string }): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>WFWorkflowActions</key>
	<array>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.openurl</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFInput</key>
				<string>${escape(url)}</string>
			</dict>
		</dict>
	</array>
	<key>WFWorkflowClientVersion</key>
	<string>1128.0.5</string>
	<key>WFWorkflowHasOutputFallback</key>
	<false/>
	<key>WFWorkflowHasShortcutInputVariables</key>
	<false/>
	<key>WFWorkflowIcon</key>
	<dict>
		<key>WFWorkflowIconStartColor</key>
		<integer>2071128575</integer>
		<key>WFWorkflowIconGlyphNumber</key>
		<integer>61453</integer>
	</dict>
	<key>WFWorkflowImportQuestions</key>
	<array/>
	<key>WFWorkflowInputContentItemClasses</key>
	<array>
		<string>WFAppStoreAppContentItem</string>
		<string>WFArticleContentItem</string>
		<string>WFContactContentItem</string>
		<string>WFDateContentItem</string>
		<string>WFEmailAddressContentItem</string>
		<string>WFGenericFileContentItem</string>
		<string>WFImageContentItem</string>
		<string>WFiTunesProductContentItem</string>
		<string>WFLocationContentItem</string>
		<string>WFDCMapsLinkContentItem</string>
		<string>WFAVAssetContentItem</string>
		<string>WFPDFContentItem</string>
		<string>WFPhoneNumberContentItem</string>
		<string>WFRichTextContentItem</string>
		<string>WFSafariWebPageContentItem</string>
		<string>WFStringContentItem</string>
		<string>WFURLContentItem</string>
	</array>
	<key>WFWorkflowMinimumClientVersion</key>
	<integer>900</integer>
	<key>WFWorkflowMinimumClientVersionString</key>
	<string>900</string>
	<key>WFWorkflowName</key>
	<string>${escape(name)}</string>
	<key>WFWorkflowTypes</key>
	<array>
		<string>NCWidget</string>
		<string>WatchKit</string>
	</array>
</dict>
</plist>
`;
}
