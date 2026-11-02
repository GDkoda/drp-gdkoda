import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, rpc } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, BookOpen, CalendarDays, ChevronRight, Download, FileText, FolderPlus,
  MessageCircle, Pencil, Pin, Plus, Search, Send, Shield, Trash2, Upload, Users, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lore")({
  head: () => ({
    meta: [
      { title: "Lore da Campanha — Mesa 3D&T" },
      { name: "description", content: "A enciclopédia viva do universo da campanha." },
    ],
  }),
  component: Lore,
});

type Category = { id: string; name: string; slug: string; description: string; sort_order: number };
type Entry = {
  id: string;
  category_id: string | null;
  title: string;
  summary: string;
  content: string;
  cover_image_url: string | null;
  tags: string[];
  related_ids: string[];
  status: "draft" | "published" | "hidden";
  visibility: "public" | "master" | "restricted";
  allowed_users: string[];
  allowed_groups: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
type Attachment = { id: string; entry_id: string; storage_path: string; file_name: string; mime_type: string; file_size: number; created_at: string };
type Profile = { id: string; username: string; display_name: string };
type Comment = {
  id: string; entry_id: string; user_id: string; content: string; pinned: boolean;
  created_at: string; updated_at: string;
  profiles?: { display_name?: string; username?: string } | null;
};
type EntryForm = {
  title: string; summary: string; categoryId: string; content: string; coverUrl: string;
  tags: string; visibility: "public" | "master" | "restricted"; status: "draft" | "published" | "hidden";
  allowedUsers: string[]; allowedGroups: string[]; relatedIds: string[]; publishAt: string;
};

const emptyForm = (): EntryForm => ({
  title: "", summary: "", categoryId: "", content: "", coverUrl: "", tags: "",
  visibility: "master", status: "draft", allowedUsers: [], allowedGroups: [], relatedIds: [], publishAt: "",
});

function localDateTime(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function readableDate(value?: string | null) {
  if (!value) return "Ainda não publicado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function safeExternalUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : null;
}

function renderInline(text: string, onOpenEntry: (id: string) => void, keyPrefix: string) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    const key = keyPrefix + "-" + index;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={key}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={key}>{token.slice(1, -1)}</em>;
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, url] = link;
      if (url.startsWith("lore:")) {
        const id = url.slice(5);
        return <button key={key} type="button" onClick={() => onOpenEntry(id)} className="font-semibold text-gold underline underline-offset-2">{label}</button>;
      }
      const safe = safeExternalUrl(url);
      return safe ? <a key={key} href={safe} target="_blank" rel="noreferrer" className="font-semibold text-gold underline underline-offset-2">{label}</a> : label;
    }
    return token;
  });
}

/** Small safe Markdown renderer: no raw HTML is ever injected into the page. */
function MarkdownContent({ value, onOpenEntry }: { value: string; onOpenEntry: (id: string) => void }) {
  const lines = value.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const content = renderInline(heading[2], onOpenEntry, "h" + index);
      const cls = heading[1].length === 1 ? "mt-8 text-2xl" : heading[1].length === 2 ? "mt-6 text-xl" : "mt-5 text-lg";
      blocks.push(<h2 key={index} className={cls + " font-display text-gold"}>{content}</h2>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(<blockquote key={index} className="my-4 border-l-2 border-primary/60 bg-muted/40 px-4 py-3 italic text-muted-foreground">{renderInline(line.replace(/^>\s?/, ""), onOpenEntry, "q" + index)}</blockquote>);
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(<ul key={"ul" + index} className="my-3 list-disc space-y-1 pl-6">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, onOpenEntry, "li" + index + "-" + itemIndex)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(<ol key={"ol" + index} className="my-3 list-decimal space-y-1 pl-6">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, onOpenEntry, "ol" + index + "-" + itemIndex)}</li>)}</ol>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^>\s?|^[-*]\s+|^\d+\.\s+/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={"p" + index} className="my-3 leading-8">{paragraph.map((part, partIndex) => <span key={partIndex}>{partIndex > 0 && <br />}{renderInline(part, onOpenEntry, "p" + index + "-" + partIndex)}</span>)}</p>);
  }
  return <div className="prose-campaign min-w-0 break-words text-[15px] text-foreground/95">{blocks}</div>;
}

function Lore() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isMaster = !!me?.isMaster;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDraftMembers, setGroupDraftMembers] = useState<string[]>([]);
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const entriesQuery = useQuery({
    queryKey: ["lore-entries"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lore_entries").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });
  const categoriesQuery = useQuery({
    queryKey: ["lore-categories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lore_categories").select("*").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
  const profilesQuery = useQuery({
    queryKey: ["lore-profiles"],
    enabled: isMaster,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profiles").select("id,username,display_name").order("display_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const groupsQuery = useQuery({
    queryKey: ["lore-groups"], enabled: isMaster,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lore_groups").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; description: string }[];
    },
  });
  const entries = entriesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const groups = groupsQuery.data ?? [];
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return entries.filter((entry) => {
      const categoryOk = categoryFilter === "all" || entry.category_id === categoryFilter;
      const haystack = [entry.title, entry.summary, entry.content, ...(entry.tags ?? [])].join(" ").toLocaleLowerCase("pt-BR");
      return categoryOk && (!q || haystack.includes(q));
    });
  }, [entries, search, categoryFilter]);

  const attachmentsQuery = useQuery({
    queryKey: ["lore-attachments", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lore_attachments").select("*").eq("entry_id", selectedId).order("created_at");
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });
  const commentsQuery = useQuery({
    queryKey: ["lore-comments", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lore_comments")
        .select("*, profiles(display_name,username)")
        .eq("entry_id", selectedId).order("pinned", { ascending: false }).order("created_at");
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
  });
  const attachments = attachmentsQuery.data ?? [];
  const comments = commentsQuery.data ?? [];

  useEffect(() => {
    let alive = true;
    async function signFiles() {
      const pairs = await Promise.all(attachments.map(async (file) => {
        const { data } = await supabase.storage.from("lore-files").createSignedUrl(file.storage_path, 3600);
        return [file.id, data?.signedUrl ?? ""] as const;
      }));
      if (alive) setSignedUrls(Object.fromEntries(pairs.filter(([, url]) => !!url)));
    }
    if (attachments.length) void signFiles();
    else setSignedUrls({});
    return () => { alive = false; };
  }, [attachments]);

  function openEditor(entry: Entry | null) {
    setSelectedId(entry?.id ?? null);
    setEditingId(entry?.id ?? null);
    setForm(entry ? {
      title: entry.title, summary: entry.summary, categoryId: entry.category_id ?? "",
      content: entry.content, coverUrl: entry.cover_image_url ?? "", tags: (entry.tags ?? []).join(", "),
      visibility: entry.visibility, status: entry.status, allowedUsers: entry.allowed_users ?? [],
      allowedGroups: entry.allowed_groups ?? [], relatedIds: entry.related_ids ?? [], publishAt: localDateTime(entry.published_at),
    } : emptyForm());
    setPendingFiles([]);
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    setEditingId(null);
    setPendingFiles([]);
  }

  async function refreshLore(entryId?: string) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["lore-entries"] }),
      qc.invalidateQueries({ queryKey: ["lore-categories"] }),
      qc.invalidateQueries({ queryKey: ["lore-attachments", entryId ?? selectedId] }),
      qc.invalidateQueries({ queryKey: ["lore-comments", entryId ?? selectedId] }),
    ]);
  }

  async function uploadPendingFiles(entryId: string) {
    for (const file of pendingFiles) {
      if (file.size > 50 * 1024 * 1024) throw new Error("Cada arquivo deve ter no máximo 50 MB.");
      const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-120);
      const storagePath = entryId + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await supabase.storage.from("lore-files").upload(storagePath, file, {
        upsert: false, contentType: file.type || "application/octet-stream",
      });
      if (uploadError) throw uploadError;
      const { error: metadataError } = await (supabase as any).from("lore_attachments").insert({
        entry_id: entryId, storage_path: storagePath, file_name: file.name,
        mime_type: file.type || "application/octet-stream", file_size: file.size,
      });
      if (metadataError) {
        await supabase.storage.from("lore-files").remove([storagePath]);
        throw metadataError;
      }
    }
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isMaster || !form.title.trim()) return;
    setBusy(true);
    try {
      const publishAt = form.status === "published"
        ? (form.publishAt ? new Date(form.publishAt).toISOString() : new Date().toISOString())
        : null;
      const payload = {
        title: form.title.trim(), summary: form.summary.trim(), category_id: form.categoryId || null,
        content: form.content, cover_image_url: safeExternalUrl(form.coverUrl.trim()),
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        related_ids: form.relatedIds.filter((id) => id !== editingId),
        status: form.status, visibility: form.visibility, allowed_users: form.visibility === "restricted" ? form.allowedUsers : [],
        allowed_groups: form.visibility === "restricted" ? form.allowedGroups : [],
        published_at: publishAt,
      };
      let entryId = editingId;
      if (entryId) {
        const { error } = await (supabase as any).from("lore_entries").update(payload).eq("id", entryId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from("lore_entries").insert({ ...payload, created_by: me?.id }).select("id").single();
        if (error) throw error;
        entryId = data.id;
      }
      if (pendingFiles.length && entryId) await uploadPendingFiles(entryId);
      toast.success(form.status === "published" ? "Publicação salva." : "Rascunho salvo.");
      closeEditor();
      setSelectedId(entryId);
      await refreshLore(entryId ?? undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a publicação.");
    } finally { setBusy(false); }
  }

  async function createCategory() {
    const name = categoryName.trim();
    if (!name || !isMaster) return;
    setBusy(true);
    try {
      const baseSlug = slugify(name) || "categoria";
      const { data: existing } = await (supabase as any).from("lore_categories").select("slug").like("slug", baseSlug + "%");
      const slug = existing?.some((item: { slug: string }) => item.slug === baseSlug)
        ? baseSlug + "-" + Math.random().toString(36).slice(2, 6)
        : baseSlug;
      const { error } = await (supabase as any).from("lore_categories").insert({ name, slug, sort_order: categories.length + 1 });
      if (error) throw error;
      setCategoryName("");
      await qc.invalidateQueries({ queryKey: ["lore-categories"] });
      toast.success("Categoria criada.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar a categoria."); }
    finally { setBusy(false); }
  }

  async function createLoreGroup() {
    if (!groupName.trim() || !isMaster) return;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("lore_groups")
        .insert({ name: groupName.trim() }).select("id").single();
      if (error) throw error;
      if (groupDraftMembers.length) {
        const { error: membersError } = await (supabase as any).from("lore_group_members")
          .insert(groupDraftMembers.map((user_id) => ({ group_id: data.id, user_id })));
        if (membersError) throw membersError;
      }
      setGroupName("");
      setGroupDraftMembers([]);
      await qc.invalidateQueries({ queryKey: ["lore-groups"] });
      toast.success("Grupo de acesso criado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o grupo.");
    } finally { setBusy(false); }
  }

  async function deleteLoreGroup(group: { id: string; name: string }) {
    if (!isMaster || !window.confirm("Excluir o grupo " + group.name + "?")) return;
    const { error } = await (supabase as any).from("lore_groups").delete().eq("id", group.id);
    if (error) toast.error(error.message);
    else {
      setForm((current) => ({ ...current, allowedGroups: current.allowedGroups.filter((id) => id !== group.id) }));
      await qc.invalidateQueries({ queryKey: ["lore-groups"] });
      toast.success("Grupo removido.");
    }
  }

  async function deleteAttachment(file: Attachment) {
    if (!isMaster) return;
    setBusy(true);
    try {
      const { error: storageError } = await supabase.storage.from("lore-files").remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error } = await (supabase as any).from("lore_attachments").delete().eq("id", file.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["lore-attachments", selectedId] });
      toast.success("Anexo removido.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível remover o anexo."); }
    finally { setBusy(false); }
  }

  async function deleteEntry(entry: Entry) {
    if (!isMaster || !window.confirm("Excluir definitivamente esta publicação e seus comentários/anexos?")) return;
    setBusy(true);
    try {
      const { data: files } = await (supabase as any).from("lore_attachments").select("storage_path").eq("entry_id", entry.id);
      const paths = (files ?? []).map((file: { storage_path: string }) => file.storage_path);
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from("lore-files").remove(paths);
        if (storageError) throw storageError;
      }
      const { error } = await (supabase as any).from("lore_entries").delete().eq("id", entry.id);
      if (error) throw error;
      setSelectedId(null);
      await refreshLore(entry.id);
      toast.success("Publicação excluída.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir a publicação."); }
    finally { setBusy(false); }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEntry || !commentText.trim()) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("lore_comments").insert({
        entry_id: selectedEntry.id, user_id: me?.id, content: commentText.trim(),
      });
      if (error) throw error;
      setCommentText("");
      await qc.invalidateQueries({ queryKey: ["lore-comments", selectedEntry.id] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar o comentário."); }
    finally { setBusy(false); }
  }

  async function saveComment(comment: Comment) {
    if (!editingCommentText.trim()) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("lore_comments").update({ content: editingCommentText.trim() }).eq("id", comment.id);
      if (error) throw error;
      setEditingCommentId(null);
      await qc.invalidateQueries({ queryKey: ["lore-comments", selectedId] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível editar o comentário."); }
    finally { setBusy(false); }
  }

  async function togglePinned(comment: Comment) {
    try {
      await rpc("set_lore_comment_pinned", { _comment: comment.id, _pinned: !comment.pinned });
      await qc.invalidateQueries({ queryKey: ["lore-comments", selectedId] });
    } catch { /* rpc exibe a mensagem de erro */ }
  }

  async function deleteComment(comment: Comment) {
    if (!window.confirm("Excluir este comentário?")) return;
    const { error } = await (supabase as any).from("lore_comments").delete().eq("id", comment.id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: ["lore-comments", selectedId] });
  }

  const categoryLabel = (id: string | null) => categories.find((category) => category.id === id)?.name ?? "Sem categoria";
  const openRelated = (id: string) => {
    if (entries.some((entry) => entry.id === id)) {
      setSelectedId(id);
      setEditing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else toast.error("Esta página relacionada ainda não está disponível para sua conta.");
  };

  if (entriesQuery.isLoading || categoriesQuery.isLoading) {
    return <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Abrindo os arquivos da campanha…</div>;
  }
  if (entriesQuery.isError || categoriesQuery.isError) {
    return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">Não foi possível carregar a Lore. Verifique a migração do banco e as políticas de acesso.</div>;
  }

  return (
    <div className="space-y-5">
      <header className="page-heading">
        <div>
          <p className="page-eyebrow">Arquivo oficial do mundo</p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl text-gold"><BookOpen className="h-7 w-7" />Lore da Campanha</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Histórias, lugares, personagens e registros descobertos durante a aventura.</p>
        </div>
        {isMaster && <Button onClick={() => openEditor(null)}><Plus className="h-4 w-4" />Nova publicação</Button>}
      </header>

      {editing && isMaster ? (
        <form onSubmit={saveEntry} className="space-y-5 rounded-2xl border border-primary/25 bg-card p-4 shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><p className="page-eyebrow">Oficina do Mestre</p><h2 className="mt-1 font-display text-2xl">{editingId ? "Editar publicação" : "Nova publicação"}</h2><p className="text-sm text-muted-foreground">O conteúdo fica protegido até você publicá-lo e escolher sua visibilidade.</p></div>
            <Button type="button" variant="ghost" size="icon" onClick={closeEditor} aria-label="Fechar editor"><X /></Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Título</span><Input required maxLength={140} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: A queda do Reino de Arvendel" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Resumo</span><Textarea rows={2} maxLength={320} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Uma breve apresentação para o mural da Lore…" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Conteúdo do artigo (Markdown)</span><Textarea required rows={18} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder={"# Um título\n\nEscreva a história aqui. Use **negrito**, *itálico*, listas e links.\n\nPara criar um link interno, use [Nome da página](lore:ID-DA-PUBLICACAO)."} className="font-mono text-sm leading-relaxed" /><span className="text-xs text-muted-foreground">Suporta títulos (#), subtítulos (##), negrito, itálico, listas, citações e links.</span></label>
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Imagem de capa (URL HTTPS)</span><Input value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} placeholder="https://…" /></label>
              <div className="space-y-2 rounded-xl border border-dashed border-primary/35 bg-background/40 p-4">
                <label className="flex cursor-pointer items-center gap-2 font-semibold text-gold"><Upload className="h-4 w-4" />Anexar imagens, mapas, PDFs e documentos<input type="file" multiple className="sr-only" onChange={(e) => setPendingFiles(Array.from(e.target.files ?? []))} /></label>
                <p className="text-xs text-muted-foreground">Arquivos privados, até 50 MB cada. Imagens aparecem em galeria e documentos podem ser baixados.</p>
                {pendingFiles.length > 0 && <ul className="space-y-1 text-sm">{pendingFiles.map((file, index) => <li key={index} className="flex items-center justify-between gap-2"><span className="truncate">{file.name} · {formatBytes(file.size)}</span><button type="button" onClick={() => setPendingFiles(pendingFiles.filter((_, i) => i !== index))} aria-label={"Remover " + file.name}><X className="h-4 w-4" /></button></li>)}</ul>}
                {editingId && attachments.length > 0 && <div className="mt-3 border-t border-border pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arquivos já anexados</p>{attachments.map((file) => <div key={file.id} className="flex items-center justify-between gap-2 py-1 text-sm"><span className="truncate">{file.file_name}</span><button type="button" disabled={busy} onClick={() => void deleteAttachment(file)} className="text-destructive" aria-label={"Excluir " + file.file_name}><Trash2 className="h-4 w-4" /></button></div>)}</div>}
              </div>
            </div>
            <aside className="space-y-3">
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Categoria</span><select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full rounded-lg border px-3 py-2"><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Etiquetas (separadas por vírgula)</span><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="guerra, antigo, profecia" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Publicação</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EntryForm["status"] })} className="w-full rounded-lg border px-3 py-2"><option value="draft">Rascunho</option><option value="published">Publicado / programado</option><option value="hidden">Oculto</option></select></label>
              {form.status === "published" && <label className="block space-y-1.5"><span className="text-sm font-semibold">Publicar em</span><Input type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} /><span className="text-xs text-muted-foreground">Uma data futura libera a página automaticamente no horário escolhido.</span></label>}
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Quem pode ler?</span><select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as EntryForm["visibility"] })} className="w-full rounded-lg border px-3 py-2"><option value="public">Todos os jogadores</option><option value="restricted">Jogadores escolhidos</option><option value="master">Somente Mestre (segredo)</option></select></label>
              {form.visibility === "restricted" && <div className="space-y-3 rounded-xl border p-3">{(profilesQuery.data ?? []).filter((profile) => profile.id !== me?.id).map((profile) => <label key={profile.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"><input type="checkbox" checked={form.allowedUsers.includes(profile.id)} onChange={(e) => setForm({ ...form, allowedUsers: e.target.checked ? [...form.allowedUsers, profile.id] : form.allowedUsers.filter((id) => id !== profile.id) })} /><span className="truncate">{profile.display_name} <span className="text-muted-foreground">@{profile.username}</span></span></label>)}{!profilesQuery.data?.length && <p className="p-2 text-xs text-muted-foreground">Nenhum jogador encontrado.</p>}
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Liberar para grupos</p>
                  <div className="space-y-1">{groups.map((group) => <label key={group.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"><input type="checkbox" checked={form.allowedGroups.includes(group.id)} onChange={(e) => setForm({ ...form, allowedGroups: e.target.checked ? [...form.allowedGroups, group.id] : form.allowedGroups.filter((id) => id !== group.id) })} /><span>{group.name}</span></label>)}
                    {!groups.length && <p className="text-xs text-muted-foreground">Nenhum grupo criado ainda.</p>}
                  </div>
                  <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-2">
                    <p className="text-xs font-semibold">Criar grupo de jogadores</p>
                    <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ex.: Companhia do Norte" />
                    <div className="max-h-32 space-y-1 overflow-y-auto">{(profilesQuery.data ?? []).filter((profile) => profile.id !== me?.id).map((profile) => <label key={profile.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={groupDraftMembers.includes(profile.id)} onChange={(e) => setGroupDraftMembers(e.target.checked ? [...groupDraftMembers, profile.id] : groupDraftMembers.filter((id) => id !== profile.id))} /><span>{profile.display_name}</span></label>)}</div>
                    <Button type="button" size="sm" variant="outline" className="w-full" disabled={busy || !groupName.trim()} onClick={() => void createLoreGroup()}><Users className="h-4 w-4" />Criar grupo</Button>
                  </div>
                  {groups.length > 0 && <div className="space-y-1 border-t border-border pt-2"><p className="text-xs font-semibold text-muted-foreground">Gerenciar grupos</p>{groups.map((group) => <div key={group.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{group.name}</span><button type="button" onClick={() => void deleteLoreGroup(group)} className="text-destructive" aria-label={"Excluir grupo " + group.name}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
                </div>
              </div>}
              <label className="block space-y-1.5"><span className="text-sm font-semibold">Páginas relacionadas</span><select multiple value={form.relatedIds} onChange={(e) => setForm({ ...form, relatedIds: Array.from(e.target.selectedOptions, (option) => option.value) })} className="h-36 w-full rounded-lg border px-3 py-2 text-sm">{entries.filter((entry) => entry.id !== editingId).map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select><span className="text-xs text-muted-foreground">Use Ctrl/Cmd para selecionar várias.</span></label>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-sm font-semibold">Criar categoria</p><div className="flex gap-2"><Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Nova categoria" /><Button type="button" size="icon" disabled={busy || !categoryName.trim()} onClick={() => void createCategory()} aria-label="Criar categoria"><FolderPlus className="h-4 w-4" /></Button></div>
              </div>
            </aside>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={closeEditor}>Cancelar</Button><Button type="submit" disabled={busy || !form.title.trim()}>{busy ? "Salvando…" : editingId ? "Salvar alterações" : "Criar publicação"}</Button></div>
        </form>
      ) : selectedEntry ? (
        <article className="overflow-hidden rounded-2xl border bg-card shadow-xl">
          <div className="border-b border-border bg-muted/25 p-4 sm:p-6">
            <button type="button" onClick={() => setSelectedId(null)} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-gold"><ArrowLeft className="h-4 w-4" />Voltar à biblioteca</button>
            {isMaster && <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-semibold text-gold">{selectedEntry.status.toUpperCase()}</span><span className="rounded-full border px-2.5 py-1">{selectedEntry.visibility === "public" ? "Público" : selectedEntry.visibility === "master" ? "Privado do Mestre" : "Acesso restrito"}</span></div>}
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold">{categoryLabel(selectedEntry.category_id)}</p>
            <h2 className="mt-2 max-w-4xl font-display text-3xl leading-tight sm:text-4xl">{selectedEntry.title}</h2>
            {selectedEntry.summary && <p className="mt-3 max-w-3xl text-base text-muted-foreground">{selectedEntry.summary}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Publicado em {readableDate(selectedEntry.published_at || selectedEntry.created_at)}</span><span>Atualizado em {readableDate(selectedEntry.updated_at)}</span></div>
            {selectedEntry.tags?.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{selectedEntry.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">#{tag}</span>)}</div>}
            {isMaster && <div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openEditor(selectedEntry)}><Pencil className="h-4 w-4" />Editar</Button><Button size="sm" variant="destructive" onClick={() => void deleteEntry(selectedEntry)} disabled={busy}><Trash2 className="h-4 w-4" />Excluir</Button></div>}
          </div>
          {safeExternalUrl(selectedEntry.cover_image_url ?? "") && <img src={selectedEntry.cover_image_url!} alt="" className="max-h-[28rem] w-full object-cover" />}
          <div className="grid gap-8 p-4 sm:p-7 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">
              <MarkdownContent value={selectedEntry.content} onOpenEntry={openRelated} />
              {attachments.filter((file) => file.mime_type.startsWith("image/")).length > 0 && <section className="mt-10 space-y-3"><h3 className="font-display text-xl">Galeria</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{attachments.filter((file) => file.mime_type.startsWith("image/")).map((file) => <a key={file.id} href={signedUrls[file.id] || "#"} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border bg-muted"><img src={signedUrls[file.id]} alt={file.file_name} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" /><span className="block truncate px-2 py-1.5 text-xs text-muted-foreground">{file.file_name}</span></a>)}</div></section>}
            </div>
            <aside className="space-y-5">
              {selectedEntry.related_ids?.length > 0 && <section className="space-y-2"><h3 className="font-display text-lg">Conheça também</h3>{selectedEntry.related_ids.map((id) => entries.find((entry) => entry.id === id)).filter((entry): entry is Entry => !!entry).map((entry) => <button key={entry.id} type="button" onClick={() => openRelated(entry.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background/50 p-3 text-left text-sm hover:border-primary/50"><span className="min-w-0"><span className="block truncate font-semibold">{entry.title}</span><span className="text-xs text-muted-foreground">{categoryLabel(entry.category_id)}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-gold" /></button>)}</section>}
              <section className="space-y-2"><h3 className="font-display text-lg">Arquivos e documentos</h3>{attachments.filter((file) => !file.mime_type.startsWith("image/")).length === 0 && <p className="text-xs text-muted-foreground">Nenhum documento anexado.</p>}{attachments.filter((file) => !file.mime_type.startsWith("image/")).map((file) => <div key={file.id} className="flex items-center gap-2 rounded-xl border bg-background/50 p-3"><FileText className="h-5 w-5 shrink-0 text-gold" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.file_name}</p><p className="text-xs text-muted-foreground">{formatBytes(file.file_size)}</p></div>{signedUrls[file.id] && <a href={signedUrls[file.id]} download={file.file_name} target="_blank" rel="noreferrer" aria-label={"Baixar " + file.file_name} className="rounded-lg p-2 text-gold hover:bg-muted"><Download className="h-4 w-4" /></a>}</div>)}</section>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"><Shield className="mb-2 h-4 w-4 text-gold" />Arquivos e páginas respeitam as permissões de leitura da campanha.</div>
            </aside>
          </div>
          <section className="border-t border-border bg-muted/20 p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2"><MessageCircle className="h-5 w-5 text-gold" /><h3 className="font-display text-xl">Discussão da publicação</h3><span className="text-xs text-muted-foreground">({comments.length})</span></div>
            <form onSubmit={submitComment} className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end"><Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={2} maxLength={3000} placeholder="Compartilhe uma teoria, observação ou pergunta…" /><Button type="submit" disabled={busy || !commentText.trim()}><Send className="h-4 w-4" />Comentar</Button></form>
            <div className="space-y-3">{comments.map((comment) => {
              const own = comment.user_id === me?.id;
              const canModerate = isMaster || own;
              return <div key={comment.id} className={\`rounded-xl border p-3 sm:p-4 ${comment.pinned ? "border-primary/40 bg-primary/5" : "border-border bg-card"}\`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{comment.profiles?.display_name || comment.profiles?.username || "Aventureiro"}</span>{comment.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-gold"><Pin className="h-3 w-3" />Fixado pelo Mestre</span>}<span className="text-xs text-muted-foreground">{readableDate(comment.created_at)}</span></div><div className="flex gap-1">{isMaster && <button type="button" onClick={() => void togglePinned(comment)} title={comment.pinned ? "Desafixar" : "Fixar comentário"} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-gold"><Pin className="h-4 w-4" /></button>}{canModerate && <button type="button" onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }} title="Editar comentário" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>}{canModerate && <button type="button" onClick={() => void deleteComment(comment)} title="Excluir comentário" className="rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>}</div></div>
                {editingCommentId === comment.id ? <div className="mt-3 space-y-2"><Textarea value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} rows={3} maxLength={3000} /><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>Cancelar</Button><Button type="button" size="sm" onClick={() => void saveComment(comment)} disabled={busy || !editingCommentText.trim()}>Salvar</Button></div></div> : <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>}
              </div>;
            })}{!comments.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Ainda não há comentários. Comece a conversa sobre este assunto.</p>}</div>
          </section>
        </article>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row">
              <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar personagens, lugares, eventos…" className="pl-10" /></label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="min-h-11 rounded-xl border bg-background px-3 text-sm lg:w-64"><option value="all">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setCategoryFilter("all")} className={\`rounded-full border px-3 py-1.5 text-xs font-semibold ${categoryFilter === "all" ? "border-primary/40 bg-primary/10 text-gold" : "border-border text-muted-foreground"}\`}>Tudo</button>{categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryFilter(category.id)} className={\`rounded-full border px-3 py-1.5 text-xs font-semibold ${categoryFilter === category.id ? "border-primary/40 bg-primary/10 text-gold" : "border-border text-muted-foreground"}\`}>{category.name}</button>)}</div>
          </section>

          {isMaster && <section className="flex flex-wrap items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><p className="flex-1 text-muted-foreground">Modo Mestre: rascunhos, páginas ocultas, publicações agendadas e segredos aparecem somente para você. O banco bloqueia o acesso dos jogadores a esse conteúdo.</p><Button size="sm" variant="outline" onClick={() => openEditor(null)}><Plus className="h-4 w-4" />Escrever</Button></section>}

          {filteredEntries.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredEntries.map((entry) => (
                <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className="group overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl">
                  <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/20 via-muted to-background">
                    {safeExternalUrl(entry.cover_image_url ?? "") ? <img src={entry.cover_image_url!} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><BookOpen className="h-12 w-12 text-primary/50" /></div>}
                    {isMaster && <span className="absolute left-3 top-3 rounded-full border border-background/40 bg-background/85 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">{entry.status === "draft" ? "Rascunho" : entry.status === "hidden" ? "Oculto" : entry.published_at && new Date(entry.published_at) > new Date() ? "Programado" : "Publicado"}</span>}
                  </div>
                  <div className="space-y-3 p-4"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">{categoryLabel(entry.category_id)}</span><span className="text-[10px] text-muted-foreground">{readableDate(entry.published_at || entry.updated_at).split(" às ")[0]}</span></div><h2 className="line-clamp-2 font-display text-xl">{entry.title}</h2><p className="line-clamp-3 min-h-[3.7rem] text-sm text-muted-foreground">{entry.summary || entry.content.slice(0, 150)}</p>{entry.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{entry.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">#{tag}</span>)}</div>}<span className="inline-flex items-center gap-1 text-xs font-semibold text-gold">Abrir publicação <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span></div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state"><BookOpen className="mx-auto h-9 w-9 text-gold" /><h2 className="font-display text-xl text-foreground">{search || categoryFilter !== "all" ? "Nenhum resultado encontrado" : "As páginas da campanha ainda serão escritas"}</h2><p className="mx-auto max-w-lg text-sm">{isMaster ? "Crie a primeira publicação, registre os acontecimentos e compartilhe o que os jogadores já descobriram." : "Quando o Mestre publicar histórias, personagens e lugares, tudo aparecerá nesta biblioteca."}</p>{isMaster && <Button className="mx-auto mt-2" onClick={() => openEditor(null)}><Plus className="h-4 w-4" />Criar primeira página</Button>}</div>
          )}
          {isMaster && <p className="text-right text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? "registro" : "registros"} na biblioteca</p>}
        </>
      )}
    </div>
  );
}
