import { useEffect, useState, type ReactNode } from "react";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HistoryExtension } from "@lexical/history";
import { registerRichText } from "@lexical/rich-text";
import {
  $getSelection, $isRangeSelection, defineExtension,
  FORMAT_TEXT_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND,
  type SerializedEditorState, type TextFormatType,
} from "lexical";

const formats: { value: TextFormatType; label: string; text: string }[] = [
  { value: "bold", label: "加粗", text: "B" },
  { value: "italic", label: "斜体", text: "I" },
  { value: "underline", label: "下划线", text: "U" },
  { value: "strikethrough", label: "删除线", text: "S" },
];

function Toolbar({ visible, disabled, status }: { visible: boolean; disabled: boolean; status: ReactNode }) {
  const [editor] = useLexicalComposerContext();
  const [active, setActive] = useState<TextFormatType[]>([]);
  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        setActive(formats.filter(({ value }) => selection.hasFormat(value)).map(({ value }) => value));
      }
    });
  }), [editor]);
  useEffect(() => { editor.setEditable(!disabled); }, [editor, disabled]);

  return <div className="editor-toolbar" role="toolbar" aria-label="文字格式" hidden={!visible}>
    {formats.map(({ value, label, text }) => <button
      key={value} type="button" className={`note-btn format-${value}`}
      aria-label={label} title={label} aria-pressed={active.includes(value)} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { editor.dispatchCommand(FORMAT_TEXT_COMMAND, value); editor.focus(); }}
    >{text}</button>)}
    <button type="button" className="note-btn" aria-label="增加缩进" title="增加缩进" disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined); editor.focus(); }}>→</button>
    <button type="button" className="note-btn" aria-label="减少缩进" title="减少缩进" disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined); editor.focus(); }}>←</button>
    <span className="editor-status" role="status">{status}</span>
  </div>;
}

export function RichTextEditor({ initialDocument, focused, disabled, status, onChange, onError }: {
  initialDocument: SerializedEditorState;
  focused: boolean;
  disabled: boolean;
  status: ReactNode;
  onChange: (document: SerializedEditorState) => void;
  onError: (error: Error) => void;
}) {
  const [pointerFocus, setPointerFocus] = useState(false);
  // The editor owns the live draft; focus and save acknowledgements must not recreate it.
  const [extension] = useState(() => defineExtension({
    name: "sticky-rich-text",
    namespace: "sticky-rich-text",
    dependencies: [HistoryExtension],
    register: (editor) => registerRichText(editor),
    $initialEditorState: JSON.stringify(initialDocument),
    onError,
    theme: { text: {
      bold: "format-bold", italic: "format-italic", underline: "format-underline",
      strikethrough: "format-strikethrough", underlineStrikethrough: "format-underline-strike",
    } },
  }));
  return <LexicalExtensionComposer extension={extension} contentEditable={null}>
    <div className="editor-body">
      <ContentEditable className="rich-text" aria-label="便笺内容" aria-placeholder="写点什么…"
        data-pointer-focus={pointerFocus} onPointerDown={() => setPointerFocus(true)} onBlur={() => setPointerFocus(false)}
        placeholder={<span className="editor-placeholder">写点什么…</span>} />
    </div>
    <Toolbar visible={focused} disabled={disabled} status={status} />
    <OnChangePlugin ignoreSelectionChange ignoreHistoryMergeTagChange={false}
      onChange={(state) => onChange(state.toJSON())} />
  </LexicalExtensionComposer>;
}
