import { requireAdmin, sameOrigin } from "../_admin.js";

const documentTypes = new Set(["photo"]);
const maxFileSize = 5 * 1024 * 1024;
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function contentTypeFor(type, bytes) {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (type === "photo") {
    if (isJpeg) return { mime: "image/jpeg", extension: "jpg" };
    if (isPng) return { mime: "image/png", extension: "png" };
    if (isWebp) return { mime: "image/webp", extension: "webp" };
    return null;
  }
  if (isJpeg) return { mime: "image/jpeg", extension: "jpg" };
  if (isPng) return { mime: "image/png", extension: "png" };
  if (isWebp) return { mime: "image/webp", extension: "webp" };
  if (isPdf) return { mime: "application/pdf", extension: "pdf" };
  return null;
}

function safeDownloadName(type, mime) {
  const extension = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `student-${type}.${extension}`;
}

export async function onRequest({ request, env }) {
  try {
    const method = request.method;
    if (!["GET", "POST", "DELETE"].includes(method)) return json({ error: "Method not allowed" }, 405);
    if (method !== "GET" && !sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    const account = await requireAdmin(request, env);
    if (account.error) return json({ error: account.error }, account.status);

    const url = new URL(request.url);
    const studentId = url.searchParams.get("student_id");
    const type = url.searchParams.get("type");
    const preview = url.searchParams.get("preview") === "1";
    if (!studentId || studentId.length > 128) return json({ error: "Invalid student ID" }, 400);

    if (method === "GET" && !type) {
      const result = await env.DB.prepare(
        "SELECT document_type, file_name, content_type, file_size, created_at FROM student_documents WHERE student_id = ? ORDER BY document_type"
      ).bind(studentId).all();
      return json({ data: result.results || [] });
    }
    if (!type || !documentTypes.has(type)) return json({ error: "Invalid document type" }, 400);

    const stored = await env.DB.prepare(
      "SELECT object_key, file_name, content_type, file_size FROM student_documents WHERE student_id = ? AND document_type = ?"
    ).bind(studentId, type).first();

    if (method === "GET") {
      if (!stored) return json({ error: "Document not found" }, 404);
      if (!env.STUDENT_FILES) return json({ error: "Private R2 storage is not connected to this Pages project yet." }, 503);
      const object = await env.STUDENT_FILES.get(stored.object_key);
      if (!object) return json({ error: "Document file not found" }, 404);
      return new Response(object.body, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": stored.content_type,
          "Content-Disposition": `${preview && type === "photo" ? "inline" : "attachment"}; filename="${safeDownloadName(type, stored.content_type)}"`,
          "Content-Length": String(stored.file_size),
          "X-Content-Type-Options": "nosniff",
          ...(!preview ? { "Content-Security-Policy": "default-src 'none'; sandbox" } : {}),
        },
      });
    }

    if (method === "DELETE") {
      if (!stored) return json({ error: "Document not found" }, 404);
      if (!env.STUDENT_FILES) return json({ error: "Private R2 storage is not connected to this Pages project yet." }, 503);
      await env.STUDENT_FILES.delete(stored.object_key);
      await env.DB.prepare("DELETE FROM student_documents WHERE student_id = ? AND document_type = ?").bind(studentId, type).run();
      return json({ success: true });
    }

    if (!env.STUDENT_FILES) return json({ error: "Private R2 storage is not connected to this Pages project yet." }, 503);
    const student = await env.DB.prepare("SELECT id FROM students WHERE id = ? AND is_active = 1 LIMIT 1").bind(studentId).first();
    if (!student) return json({ error: "Active student not found" }, 404);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return json({ error: "Choose a file to upload" }, 400);
    if (file.size > maxFileSize) return json({ error: "Each file must be 5 MB or smaller" }, 413);
    const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const verified = contentTypeFor(type, prefix);
    if (!verified) return json({ error: type === "photo" ? "Photo must be a valid JPG, PNG, or WebP image" : "Document must be a valid JPG, PNG, WebP, or PDF file" }, 400);

    const key = `students/${studentId}/${type}/${crypto.randomUUID()}.${verified.extension}`;
    const oldKey = stored?.object_key;
    await env.STUDENT_FILES.put(key, file.stream(), {
      httpMetadata: { contentType: verified.mime, contentDisposition: "attachment" },
    });
    try {
      await env.DB.prepare(`
        INSERT INTO student_documents (student_id, document_type, object_key, file_name, content_type, file_size, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, document_type) DO UPDATE SET
          object_key = excluded.object_key,
          file_name = excluded.file_name,
          content_type = excluded.content_type,
          file_size = excluded.file_size,
          uploaded_by = excluded.uploaded_by,
          created_at = CURRENT_TIMESTAMP
      `).bind(studentId, type, key, String(file.name || "upload").slice(0, 180), verified.mime, file.size, account.adminId).run();
    } catch (error) {
      await env.STUDENT_FILES.delete(key);
      throw error;
    }
    if (oldKey) await env.STUDENT_FILES.delete(oldKey);
    return json({ success: true, document: { document_type: type, file_name: String(file.name || "upload").slice(0, 180), content_type: verified.mime, file_size: file.size } }, stored ? 200 : 201);
  } catch (error) {
    const message = String(error?.message || "");
    if (/no such table: student_documents/i.test(message)) return json({ error: "Apply migrations/0010_student_documents.sql to the production D1 database, then try again." }, 503);
    return json({ error: "Unable to complete the student document request" }, 500);
  }
}
