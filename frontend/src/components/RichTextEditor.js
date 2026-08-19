import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Quote, Link2, Undo2, Redo2, Minus } from "lucide-react";

const TB_BTN = "p-2 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition";
const TB_BTN_ACTIVE = "p-2 rounded-md bg-slate-900 text-white transition";

export default function RichTextEditor({ value, onChange, placeholder = "Écrivez votre article…" }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "underline" } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none min-h-[280px] p-4 focus:outline-none",
        "data-testid": "rich-editor",
      },
    },
  });

  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Adresse du lien", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const Btn = ({ onClick, active, disabled, children, testId, title }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      data-testid={testId}
      className={active ? TB_BTN_ACTIVE : TB_BTN}>
      {children}
    </button>
  );

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white" data-testid="rich-editor-wrapper">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} testId="rte-bold" title="Gras"><Bold size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} testId="rte-italic" title="Italique"><Italic size={16} /></Btn>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} testId="rte-h2" title="Titre"><Heading2 size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} testId="rte-h3" title="Sous-titre"><Heading3 size={16} /></Btn>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} testId="rte-ul" title="Liste"><List size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} testId="rte-ol" title="Liste numérotée"><ListOrdered size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} testId="rte-quote" title="Citation"><Quote size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} testId="rte-hr" title="Séparateur"><Minus size={16} /></Btn>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <Btn onClick={setLink} active={editor.isActive("link")} testId="rte-link" title="Lien"><Link2 size={16} /></Btn>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} testId="rte-undo" title="Annuler"><Undo2 size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} testId="rte-redo" title="Refaire"><Redo2 size={16} /></Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
