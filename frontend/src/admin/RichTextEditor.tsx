import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link2,
  Link2Off,
  Minus,
  Code2,
  Table as TableIcon,
  ImagePlus,
  Undo2,
  Redo2,
  Heading2,
  Heading3,
  Heading4,
  Pilcrow,
  X,
  Loader2,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Trash2,
  Upload,
  Globe,
  Sparkles,
} from "lucide-react";
import { uploadStoryImage } from "@/lib/stories";

/**
 * Zero-dependency rich text editor built on contentEditable.
 * Produces semantic HTML (h2/h3/h4, ul/ol, blockquote, figure, table, pre)
 * which is sanitized server-side before storage.
 */

const TOOLBTN =
  "w-8 h-8 flex items-center justify-center rounded-lg text-[#04314A] hover:bg-[#F0F0ED] hover:text-[#00AAEB] active:bg-[#E8E8E5] transition-all disabled:opacity-30 disabled:cursor-not-allowed";
const ACTIVE_TOOLBTN =
  "w-8 h-8 flex items-center justify-center rounded-lg bg-[#04314A] text-white transition-all";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Light client-side paste cleanup; full sanitization happens server-side. */
const PASTE_ALLOWED = new Set([
  "P", "BR", "H2", "H3", "H4", "STRONG", "B", "EM", "I", "U", "S", "DEL",
  "UL", "OL", "LI", "A", "BLOCKQUOTE", "FIGURE", "FIGCAPTION", "IMG", "TABLE",
  "THEAD", "TBODY", "TR", "TH", "TD", "PRE", "CODE", "HR",
]);

function sanitizePastedNode(node: Node, out: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(escapeHtml(node.textContent ?? ""));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName;
  if (!PASTE_ALLOWED.has(tag)) {
    el.childNodes.forEach((c) => sanitizePastedNode(c, out));
    return;
  }
  if (tag === "BR" || tag === "HR" || tag === "IMG") {
    if (tag === "IMG") {
      const src = el.getAttribute("src") ?? "";
      if (/^(https?:|\/)/i.test(src)) {
        out.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(el.getAttribute("alt") ?? "")}" loading="lazy">`);
      }
    } else {
      out.push(tag === "BR" ? "<br>" : "<hr>");
    }
    return;
  }
  out.push(`<${tag.toLowerCase()}>`);
  el.childNodes.forEach((c) => sanitizePastedNode(c, out));
  out.push(`</${tag.toLowerCase()}>`);
}

function sanitizePasted(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const out: string[] = [];
    doc.body.childNodes.forEach((c) => sanitizePastedNode(c, out));
    return out.join("");
  } catch {
    return "";
  }
}

export function isEmptyRichHtml(html: string): boolean {
  const div = document.createElement("div");
  div.innerHTML = html;
  const hasMedia = !!div.querySelector("img,table,figure,blockquote");
  return !hasMedia && (div.textContent ?? "").trim() === "";
}

type DialogState =
  | { kind: "none" }
  | { kind: "link"; url: string }
  | { kind: "image"; tab: "upload" | "url"; uploading: boolean; url: string; alt: string; caption: string; error: string }
  | { kind: "table"; rows: number; cols: number; header: boolean };

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  resetKey,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  resetKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [words, setWords] = useState(0);
  const [characters, setCharacters] = useState(0);
  const [inTable, setInTable] = useState(false);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    block: "p",
  });

  // Initial / external content sync
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ((resetKey ?? "") !== el.dataset.resetKey) {
      el.dataset.resetKey = resetKey ?? "";
      el.innerHTML = value ?? "";
      recount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value != null && el.innerHTML !== value && document.activeElement !== el) {
      el.innerHTML = value;
      recount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateActiveFormats = useCallback(() => {
    try {
      const bold = document.queryCommandState("bold");
      const italic = document.queryCommandState("italic");
      const underline = document.queryCommandState("underline");
      const strikeThrough = document.queryCommandState("strikeThrough");

      const cell = currentCell();
      const probe = cell ?? (savedRange.current?.startContainer as HTMLElement | null);
      let block = "p";
      let node: HTMLElement | null =
        probe?.nodeType === 3 ? (probe.parentElement as HTMLElement | null) : probe;
      while (node && node !== ref.current) {
        const t = node.tagName?.toLowerCase();
        if (["p", "h2", "h3", "h4", "blockquote", "pre"].includes(t)) {
          block = t;
          break;
        }
        node = node.parentElement;
      }

      setActiveFormats({
        bold,
        italic,
        underline,
        strikeThrough,
        block,
      });
    } catch {
      // ignore
    }
  }, []);

  const recount = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const div = document.createElement("div");
    div.innerHTML = el.innerHTML;
    const text = (div.textContent ?? "").trim();
    const wordList = text.split(/\s+/).filter(Boolean);
    const count = el.querySelector("img,table") ? Math.max(wordList.length, 1) : wordList.length;
    setWords(count);
    setCharacters(text.length);
    const cell = currentCell();
    setInTable(!!cell && el.contains(cell));
    updateActiveFormats();
  }, [updateActiveFormats]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (ref.current && ref.current.contains(range.commonAncestorContainer)) {
        savedRange.current = range.cloneRange();
      }
    }
    updateActiveFormats();
  }, [updateActiveFormats]);

  const restoreSelection = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }, []);

  const emit = useCallback(() => {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
    recount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, recount]);

  const exec = useCallback(
    (cmd: string, cmdValue?: string) => {
      const el = ref.current;
      if (!el) return;
      restoreSelection();
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand(cmd, false, cmdValue);
      emit();
    },
    [restoreSelection, emit],
  );

  const toggleBlock = (tag: string) => {
    const el = ref.current;
    if (!el) return;
    const cell = currentCell();
    const probe = cell ?? (savedRange.current?.startContainer as HTMLElement | null);
    let current = "";
    let node: HTMLElement | null =
      probe?.nodeType === 3 ? (probe.parentElement as HTMLElement | null) : probe;
    while (node && node !== el) {
      const t = node.tagName?.toLowerCase();
      if (["p", "h2", "h3", "h4"].includes(t)) {
        current = t;
        break;
      }
      if (["ul", "ol", "table", "pre"].includes(t)) break;
      node = node.parentElement;
    }
    exec("formatBlock", current === tag ? "p" : tag);
  };

  function currentCell(): HTMLTableCellElement | null {
    let n = savedRange.current?.startContainer ?? window.getSelection()?.anchorNode ?? null;
    const root = ref.current;
    while (n && n !== root) {
      if (n.nodeType === 1 && ["TD", "TH"].includes((n as HTMLElement).tagName)) {
        return n as HTMLTableCellElement;
      }
      n = n.parentNode;
    }
    return null;
  }

  const openDialog = (d: DialogState) => {
    saveSelection();
    setDialog(d);
  };

  const applyLink = () => {
    const d = dialog as Extract<DialogState, { kind: "link" }>;
    const url = d.url.trim();
    if (!url) {
      setDialog({ kind: "none" });
      return;
    }
    const safe = /^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : `https://${url}`;
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && savedRange.current) {
      const anchor = document.createElement("a");
      anchor.href = safe;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = safe.replace(/^https?:\/\//, "");
      savedRange.current.insertNode(anchor);
      savedRange.current.setStartAfter(anchor);
      savedRange.current.collapse(true);
      emit();
    } else {
      exec("createLink", safe);
      ref.current
        ?.querySelectorAll(`a[href="${CSS.escape(safe)}"]`)
        .forEach((a) => {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        });
      emit();
    }
    setDialog({ kind: "none" });
  };

  const removeLink = () => {
    restoreSelection();
    exec("unlink");
    setDialog({ kind: "none" });
  };

  const insertImage = () => {
    const d = dialog as Extract<DialogState, { kind: "image" }>;
    const src = d.url.trim();
    if (!src) {
      setDialog({ kind: "none" });
      return;
    }
    const caption = d.caption.trim();
    const alt = d.alt.trim();
    const fig =
      `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"` +
      (src.startsWith("/") ? ' loading="lazy"' : "") +
      ">" +
      (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "") +
      `</figure><p><br></p>`;
    restoreSelection();
    document.execCommand("insertHTML", false, fig);
    emit();
    setDialog({ kind: "none" });
  };

  const uploadAndStageImage = async (file: File, alt: string) => {
    const d = dialog as Extract<DialogState, { kind: "image" }>;
    setDialog({ ...d, uploading: true, error: "", alt: alt || d.alt });
    try {
      const res = await uploadStoryImage(file, d.alt.trim());
      setDialog({ ...d, url: res.url, uploading: false, error: "" });
    } catch (e) {
      setDialog({
        ...d,
        uploading: false,
        error: e instanceof Error ? e.message : "Upload failed",
      });
    }
  };

  const insertTable = () => {
    const d = dialog as Extract<DialogState, { kind: "table" }>;
    const rows = Math.max(1, Math.min(d.rows, 12));
    const cols = Math.max(1, Math.min(d.cols, 8));
    const head = d.header
      ? `<thead><tr>${`<th>Header</th>`.repeat(cols)}</tr></thead>`
      : "";
    const body = Array.from(
      { length: d.header ? rows - 1 : rows },
      () => `<tr>${"<td><br></td>".repeat(cols)}</tr>`,
    ).join("");
    const html = `<table>${head}<tbody>${body || "<tr>" + "<td><br></td>".repeat(cols) + "</tr>"}</tbody></table><p><br></p>`;
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    emit();
    setDialog({ kind: "none" });
  };

  // Table operations
  const tableOp = (op: string) => {
    const cell = currentCell();
    if (!cell) return;
    const row = cell.parentElement as HTMLTableRowElement;
    const table = row.closest("table");
    if (!table) return;
    const cellIndex = cell.cellIndex;

    if (op === "rowAbove" || op === "rowBelow") {
      const newRow = row.cloneNode(true) as HTMLTableRowElement;
      newRow.querySelectorAll("td,th").forEach((c) => ((c as HTMLElement).innerHTML = "<br>"));
      row.parentElement!.insertBefore(newRow, op === "rowBelow" ? row.nextSibling : row);
    } else if (op === "colLeft" || op === "colRight") {
      table.querySelectorAll("tr").forEach((r) => {
        const cells = Array.from(r.querySelectorAll("td,th")) as HTMLTableCellElement[];
        const refCell = cells[cellIndex];
        if (!refCell) return;
        const nc = document.createElement(r.tagName === "TR" ? "td" : "td");
        nc.innerHTML = "<br>";
        r.insertBefore(nc, op === "colRight" ? refCell.nextSibling : refCell);
      });
    } else if (op === "delRow") {
      if (table.rows.length <= 1) {
        table.remove();
      } else {
        row.remove();
      }
    } else if (op === "delCol") {
      const cols = table.rows[0]?.cells.length ?? 1;
      if (cols <= 1) {
        table.remove();
      } else {
        table.querySelectorAll("tr").forEach((r) => {
          const c = r.querySelectorAll("td,th")[cellIndex] as HTMLElement | undefined;
          c?.remove();
        });
      }
    } else if (op === "delTable") {
      table.remove();
    }
    emit();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    if (html) {
      document.execCommand("insertHTML", false, sanitizePasted(html));
    } else {
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    }
    emit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        openDialog({ kind: "link", url: "" });
      }
    }
  };

  return (
    <div className="border border-[#E8E8E5] rounded-2xl bg-white shadow-xs overflow-hidden focus-within:border-[#00AAEB] focus-within:ring-2 focus-within:ring-[#00AAEB]/10 transition-all">
      {/* Sticky Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 px-3 py-2 border-b border-[#E8E8E5] bg-[#FAFAF8] sticky top-0 z-20">
        <div className="flex flex-wrap items-center gap-1">
          {/* Headings */}
          <div className="flex items-center bg-white border border-[#E8E8E5] rounded-lg p-0.5 shadow-xs">
            <button
              type="button"
              title="Normal Text (Paragraph)"
              className={activeFormats.block === "p" ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleBlock("p")}
            >
              <Pilcrow size={14} />
            </button>
            <button
              type="button"
              title="Heading 2"
              className={activeFormats.block === "h2" ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleBlock("h2")}
            >
              <Heading2 size={14} />
            </button>
            <button
              type="button"
              title="Heading 3"
              className={activeFormats.block === "h3" ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleBlock("h3")}
            >
              <Heading3 size={14} />
            </button>
            <button
              type="button"
              title="Heading 4"
              className={activeFormats.block === "h4" ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleBlock("h4")}
            >
              <Heading4 size={14} />
            </button>
          </div>

          {/* Inline styles */}
          <div className="flex items-center bg-white border border-[#E8E8E5] rounded-lg p-0.5 shadow-xs">
            <button
              type="button"
              title="Bold (Ctrl+B)"
              className={activeFormats.bold ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("bold")}
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              title="Italic (Ctrl+I)"
              className={activeFormats.italic ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("italic")}
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              title="Underline (Ctrl+U)"
              className={activeFormats.underline ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("underline")}
            >
              <Underline size={14} />
            </button>
            <button
              type="button"
              title="Strikethrough"
              className={activeFormats.strikeThrough ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("strikeThrough")}
            >
              <Strikethrough size={14} />
            </button>
          </div>

          {/* Lists & Quotes */}
          <div className="flex items-center bg-white border border-[#E8E8E5] rounded-lg p-0.5 shadow-xs">
            <button
              type="button"
              title="Bullet List"
              className={TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("insertUnorderedList")}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              title="Numbered List"
              className={TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("insertOrderedList")}
            >
              <ListOrdered size={14} />
            </button>
            <button
              type="button"
              title="Blockquote"
              className={activeFormats.block === "blockquote" ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("formatBlock", "blockquote")}
            >
              <Quote size={14} />
            </button>
            <button
              type="button"
              title="Code Block"
              className={activeFormats.block === "pre" ? ACTIVE_TOOLBTN : TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("formatBlock", "pre")}
            >
              <Code2 size={14} />
            </button>
          </div>

          {/* Inserts */}
          <div className="flex items-center bg-white border border-[#E8E8E5] rounded-lg p-0.5 shadow-xs">
            <button
              type="button"
              title="Insert Link (Ctrl+K)"
              className={TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openDialog({ kind: "link", url: "" })}
            >
              <Link2 size={14} />
            </button>
            <button
              type="button"
              title="Remove Link"
              className={TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeLink}
            >
              <Link2Off size={14} />
            </button>
            <button
              type="button"
              title="Insert Image"
              className={TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                openDialog({
                  kind: "image",
                  tab: "upload",
                  uploading: false,
                  url: "",
                  alt: "",
                  caption: "",
                  error: "",
                })
              }
            >
              <ImagePlus size={14} />
            </button>
            <button
              type="button"
              title="Insert Table"
              className={TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openDialog({ kind: "table", rows: 3, cols: 3, header: true })}
            >
              <TableIcon size={14} />
            </button>
            <button
              type="button"
              title="Divider Rule"
              className={TOOLBTN}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("insertHorizontalRule")}
            >
              <Minus size={14} />
            </button>
          </div>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center bg-white border border-[#E8E8E5] rounded-lg p-0.5 shadow-xs">
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            className={TOOLBTN}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("undo")}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            className={TOOLBTN}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("redo")}
          >
            <Redo2 size={14} />
          </button>
        </div>
      </div>

      {/* Table Action Controls Ribbon (Appears when cursor is inside a table) */}
      {inTable && (
        <div className="flex flex-wrap items-center gap-1 px-4 py-2 bg-[#04314A]/5 border-b border-[#04314A]/10 text-[11px] text-[#04314A]">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#00AAEB] flex items-center gap-1.5 mr-2">
            <TableIcon size={13} /> Table Tools:
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tableOp("rowAbove")}
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E8E8E5] rounded-md font-medium hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors"
          >
            <ArrowUpToLine size={12} /> + Row Above
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tableOp("rowBelow")}
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E8E8E5] rounded-md font-medium hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors"
          >
            <ArrowDownToLine size={12} /> + Row Below
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tableOp("colLeft")}
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E8E8E5] rounded-md font-medium hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors"
          >
            <ArrowLeftToLine size={12} /> + Col Left
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tableOp("colRight")}
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E8E8E5] rounded-md font-medium hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors"
          >
            <ArrowRightToLine size={12} /> + Col Right
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tableOp("delRow")}
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-200 text-amber-800 rounded-md font-medium hover:bg-amber-50 transition-colors ml-auto"
          >
            <Trash2 size={12} /> Delete Row
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tableOp("delCol")}
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-200 text-amber-800 rounded-md font-medium hover:bg-amber-50 transition-colors"
          >
            <X size={12} /> Delete Column
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tableOp("delTable")}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#B00020]/10 border border-[#B00020]/30 text-[#B00020] rounded-md font-medium hover:bg-[#B00020] hover:text-white transition-colors"
          >
            <Trash2 size={12} /> Delete Table
          </button>
        </div>
      )}

      {/* Link Dialog */}
      {dialog.kind === "link" && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E8E8E5] bg-[#F7F7F5] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 flex-1 bg-white border border-[#E8E8E5] rounded-xl px-3 py-1.5 focus-within:border-[#00AAEB]">
            <Globe size={15} className="text-[#B0B0AA]" />
            <input
              autoFocus
              value={dialog.url}
              onChange={(e) => setDialog({ ...dialog, url: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyLink()}
              placeholder="https://example.com"
              className="w-full text-[13px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={applyLink}
            className="px-4 py-2 rounded-xl bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors shadow-xs"
          >
            Insert Link
          </button>
          <button
            type="button"
            onClick={() => setDialog({ kind: "none" })}
            className="w-8 h-8 flex items-center justify-center text-[#737373] hover:text-[#04314A] hover:bg-[#E8E8E5] rounded-lg transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Image Dialog */}
      {dialog.kind === "image" && (
        <div className="p-4 border-b border-[#E8E8E5] bg-[#F7F7F5] space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-white border border-[#E8E8E5] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setDialog({ ...dialog, tab: "upload" })}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  dialog.tab === "upload" ? "bg-[#04314A] text-white" : "text-[#737373] hover:text-[#04314A]"
                }`}
              >
                <Upload size={12} /> Upload File
              </button>
              <button
                type="button"
                onClick={() => setDialog({ ...dialog, tab: "url" })}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  dialog.tab === "url" ? "bg-[#04314A] text-white" : "text-[#737373] hover:text-[#04314A]"
                }`}
              >
                <Globe size={12} /> Image URL
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDialog({ kind: "none" })}
              className="w-7 h-7 flex items-center justify-center text-[#737373] hover:text-[#04314A] hover:bg-[#E8E8E5] rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {dialog.tab === "upload" ? (
            <div className="border border-dashed border-[#D0D0CB] bg-white rounded-xl p-4 text-center">
              <input
                type="file"
                id="rich-image-upload"
                accept="image/*"
                disabled={dialog.uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAndStageImage(f, dialog.alt);
                }}
                className="hidden"
              />
              <label
                htmlFor="rich-image-upload"
                className="flex flex-col items-center justify-center cursor-pointer gap-2"
              >
                <div className="w-10 h-10 rounded-full bg-[#00AAEB]/10 text-[#00AAEB] flex items-center justify-center">
                  <Upload size={18} />
                </div>
                <div>
                  <span className="text-[12px] font-bold text-[#04314A] hover:text-[#00AAEB]">
                    Click to browse
                  </span>
                  <span className="text-[12px] text-[#737373]"> or drag image here</span>
                </div>
                <span className="text-[10px] text-[#A0A09A]">Supports JPG, PNG, WebP, SVG</span>
              </label>
            </div>
          ) : (
            <input
              value={dialog.url}
              onChange={(e) => setDialog({ ...dialog, url: e.target.value })}
              placeholder="Paste direct image URL (https://...)"
              className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
            />
          )}

          {dialog.uploading && (
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[#00AAEB]">
              <Loader2 size={14} className="animate-spin" /> Uploading image to media library…
            </div>
          )}

          {dialog.error && (
            <p className="text-[12px] font-medium text-red-600 bg-red-50 p-2 rounded-lg">{dialog.error}</p>
          )}

          {dialog.url && (
            <div className="relative rounded-xl overflow-hidden border border-[#E8E8E5] max-h-36 bg-black/5 flex items-center justify-center">
              <img src={dialog.url} alt="" className="max-h-36 object-contain" />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={dialog.alt}
              onChange={(e) => setDialog({ ...dialog, alt: e.target.value })}
              placeholder="Alt text (for accessibility / SEO)"
              className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] focus:outline-none focus:border-[#00AAEB]"
            />
            <input
              value={dialog.caption}
              onChange={(e) => setDialog({ ...dialog, caption: e.target.value })}
              placeholder="Caption (shown below image, optional)"
              className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] focus:outline-none focus:border-[#00AAEB]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDialog({ kind: "none" })}
              className="px-4 py-2 text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!dialog.url || dialog.uploading}
              onClick={insertImage}
              className="px-5 py-2 rounded-xl bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors disabled:opacity-40 shadow-xs"
            >
              Insert Image
            </button>
          </div>
        </div>
      )}

      {/* Table Dialog */}
      {dialog.kind === "table" && (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-[#E8E8E5] bg-[#F7F7F5] flex-wrap animate-in fade-in slide-in-from-top-1 duration-150">
          <label className="text-[12px] font-semibold text-[#04314A] flex items-center gap-2">
            <span>Rows:</span>
            <input
              type="number"
              min={1}
              max={12}
              value={dialog.rows}
              onChange={(e) => setDialog({ ...dialog, rows: Number(e.target.value) })}
              className="w-16 border border-[#E8E8E5] rounded-lg bg-white px-2 py-1 text-[13px] text-center"
            />
          </label>
          <label className="text-[12px] font-semibold text-[#04314A] flex items-center gap-2">
            <span>Columns:</span>
            <input
              type="number"
              min={1}
              max={8}
              value={dialog.cols}
              onChange={(e) => setDialog({ ...dialog, cols: Number(e.target.value) })}
              className="w-16 border border-[#E8E8E5] rounded-lg bg-white px-2 py-1 text-[13px] text-center"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-[#04314A] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dialog.header}
              onChange={(e) => setDialog({ ...dialog, header: e.target.checked })}
              className="w-4 h-4 rounded text-[#00AAEB] focus:ring-[#00AAEB]"
            />
            Include header row
          </label>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setDialog({ kind: "none" })}
              className="px-3 py-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#04314A]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={insertTable}
              className="px-4 py-1.5 rounded-xl bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors shadow-xs"
            >
              Insert Table
            </button>
          </div>
        </div>
      )}

      {/* Editing Canvas */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        spellCheck
        data-placeholder={placeholder || "Tell your story… Write paragraphs, add headers, quotes, images and tables."}
        className={`story-editor min-h-[440px] px-6 sm:px-8 py-6 outline-none text-[15px] leading-relaxed ${
          isEmptyRichHtml(value) ? "story-editor-empty" : ""
        }`}
        onInput={emit}
        onBlur={saveSelection}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
      />

      {/* Status Bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#E8E8E5] bg-[#FAFAF8] text-[11px] text-[#737373]">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#04314A]">
            {words} {words === 1 ? "word" : "words"}
          </span>
          <span className="text-[#D0D0CB]">·</span>
          <span>~{Math.max(1, Math.ceil(words / 200))} min read</span>
          <span className="text-[#D0D0CB]">·</span>
          <span>{characters} characters</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#A0A09A]">
          <Sparkles size={12} className="text-[#00AAEB]" />
          <span>Rich Text & Media</span>
        </div>
      </div>
    </div>
  );
}
