/* Servidor MOCK de la API de Mermas Mango (solo para desarrollo/pruebas del front).
   NO es el backend real: guarda todo en memoria y no valida firmas JWT.
   Implementa: /auth/register, /auth/login (form-urlencoded), /auth/me y /mermas.
   Uso: node scripts/mock-api.mjs   (escucha en http://127.0.0.1:8000)
*/
import http from "node:http";

const PORT = process.env.PORT || 8000;
const users = new Map();          // username -> { id_usuario, password, rol, activo }
let userSeq = 0;
function addUser(username, password, rol) { userSeq++; users.set(username, { id_usuario: userSeq, password, rol, activo: true }); return users.get(username); }
addUser("admin", "admin123", "admin"); // admin inicial (como el .env)
let seq = 0;
const registros = [];             // registros de merma

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
// Igual que el back real: el token solo lleva sub y exp (el rol se consulta en /auth/me).
function makeToken(username) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12 h
  return b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: username, exp }) + ".mock";
}
// Devuelve { username, rol } o null (el rol se toma de la "BD", no del token).
function readToken(req) {
  const h = req.headers["authorization"] || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const p = JSON.parse(Buffer.from(m[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (p.exp && p.exp * 1000 < Date.now()) return null;
    const u = users.get(p.sub);
    if (!u || !u.activo) return null;
    return { username: p.sub, rol: u.rol };
  } catch { return null; }
}

function send(res, code, body) {
  const data = body == null ? "" : JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  res.end(data);
}
function fmt(n) { return Number(n).toFixed(2); }

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, null);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    // ---- auth ----
    if (path === "/auth/register" && req.method === "POST") {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (who.rol !== "admin") return send(res, 403, { detail: "Solo admin puede crear usuarios" });
      let b = {};
      try { b = JSON.parse(raw || "{}"); } catch {}
      if (!b.username || !b.password) return send(res, 422, { detail: "username y password requeridos" });
      if (users.has(b.username)) return send(res, 400, { detail: "El usuario ya existe." });
      if (String(b.username).length < 3) return send(res, 422, { detail: [{ loc: ["body", "username"], msg: "String should have at least 3 characters" }] });
      if (String(b.password).length < 4) return send(res, 422, { detail: [{ loc: ["body", "password"], msg: "String should have at least 4 characters" }] });
      const rol = ["admin", "capturista", "reportes"].includes(b.rol) ? b.rol : "reportes";
      const u = addUser(b.username, b.password, rol);
      return send(res, 201, { id_usuario: u.id_usuario, username: b.username, rol, activo: true });
    }
    if (path === "/auth/login" && req.method === "POST") {
      const form = new URLSearchParams(raw);
      const u = form.get("username"), p = form.get("password");
      if (!users.has(u) || users.get(u).password !== p) return send(res, 401, { detail: "Credenciales invalidas" });
      return send(res, 200, { access_token: makeToken(u), token_type: "bearer" });
    }
    if (path === "/auth/me" && req.method === "GET") {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      const u = users.get(who.username);
      return send(res, 200, { id_usuario: u.id_usuario, username: who.username, rol: u.rol, activo: u.activo });
    }
    if (path === "/auth/usuarios" && req.method === "GET") {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (who.rol !== "admin") return send(res, 403, { detail: "Solo admin" });
      return send(res, 200, Array.from(users.entries()).map(([username, v]) => ({ id_usuario: v.id_usuario, username, rol: v.rol, activo: v.activo })));
    }
    const um = path.match(/^\/auth\/usuarios\/(\d+)$/);
    if (um) {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (who.rol !== "admin") return send(res, 403, { detail: "Solo admin" });
      const id = +um[1];
      let entry = null, uname = null;
      for (const [k, v] of users.entries()) { if (v.id_usuario === id) { entry = v; uname = k; break; } }
      if (!entry) return send(res, 404, { detail: "Usuario no encontrado" });
      if (req.method === "GET") return send(res, 200, { id_usuario: entry.id_usuario, username: uname, rol: entry.rol, activo: entry.activo });
      if (req.method === "PUT") {
        let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
        if (b.username && b.username !== uname) {
          if (users.has(b.username)) return send(res, 400, { detail: "El usuario ya existe." });
          users.delete(uname); uname = b.username; users.set(uname, entry);
        }
        if (b.password) entry.password = b.password;
        if (b.rol && ["admin", "capturista", "reportes"].includes(b.rol)) entry.rol = b.rol;
        if (typeof b.activo === "boolean") entry.activo = b.activo;
        return send(res, 200, { id_usuario: entry.id_usuario, username: uname, rol: entry.rol, activo: entry.activo });
      }
      if (req.method === "DELETE") { users.delete(uname); return send(res, 204, null); }
    }

    // ---- mermas (protegido) ----
    if (path.startsWith("/mermas")) {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      // crear: admin + capturista; editar/borrar: solo admin
      if (req.method === "POST" && !(who.rol === "admin" || who.rol === "capturista")) return send(res, 403, { detail: "Sin permiso para crear" });
      if ((req.method === "PUT" || req.method === "DELETE") && who.rol !== "admin") return send(res, 403, { detail: "Solo admin puede editar o borrar" });

      if (path === "/mermas" && req.method === "GET") {
        let out = registros.slice().sort((a, b) => b.id_registro - a.id_registro);
        const lote = url.searchParams.get("lote");
        const linea = url.searchParams.get("linea_prod");
        const tipo = url.searchParams.get("tipo_merma");
        if (lote) out = out.filter((r) => r.lote === lote);
        if (linea) out = out.filter((r) => r.linea_prod === linea);
        if (tipo) out = out.filter((r) => r.tipo_merma === tipo);
        const fecha = url.searchParams.get("fecha");
        const desde = url.searchParams.get("desde");
        const hasta = url.searchParams.get("hasta");
        if (fecha) out = out.filter((r) => (r.fecha_hora || "").slice(0, 10) === fecha);
        if (desde) out = out.filter((r) => (r.fecha_hora || "").slice(0, 10) >= desde);
        if (hasta) out = out.filter((r) => (r.fecha_hora || "").slice(0, 10) <= hasta);
        const skip = +(url.searchParams.get("skip") || 0);
        const limit = +(url.searchParams.get("limit") || 100);
        return send(res, 200, out.slice(skip, skip + limit));
      }
      if (path === "/mermas/informe" && req.method === "GET") {
        const desde = url.searchParams.get("desde");
        const hasta = url.searchParams.get("hasta");
        let src = registros;
        if (desde) src = src.filter((r) => (r.fecha_hora || "").slice(0, 10) >= desde);
        if (hasta) src = src.filter((r) => (r.fecha_hora || "").slice(0, 10) <= hasta);
        const map = {};
        src.forEach((r) => {
          const dia = (r.fecha_hora || "").slice(0, 10);
          const g = map[dia] || (map[dia] = { fecha: dia, a: 0, c: 0, n: 0 });
          if (r.tipo_merma === "aprovechable") g.a += +r.cant_kg; else g.c += +r.cant_kg;
          g.n++;
        });
        const rows = Object.values(map).map((g) => ({
          fecha: g.fecha, total_aprovechable: fmt(g.a), total_cascara_hueso: fmt(g.c),
          total_general: fmt(g.a + g.c), num_registros: g.n,
        })).sort((a, b) => b.fecha.localeCompare(a.fecha));
        return send(res, 200, rows);
      }
      if (path === "/mermas" && req.method === "POST") {
        let b = {};
        try { b = JSON.parse(raw || "{}"); } catch {}
        const n = Number(b.cant_kg);
        if (isNaN(n) || n < 0 || n > 100) return send(res, 422, { detail: [{ type: "value_error", loc: ["body", "cant_kg"], msg: "Input should be between 0 and 100", input: b.cant_kg }] });
        const rec = {
          id_registro: ++seq, cant_kg: fmt(n), tipo_merma: b.tipo_merma,
          lote: b.lote, linea_prod: b.linea_prod,
          fecha_hora: b.fecha_hora || new Date().toISOString().slice(0, 19),
          id_usuario: (users.get(who.username) || {}).id_usuario, registrado_por: who.username,
        };
        registros.push(rec);
        return send(res, 201, rec);
      }
      const idm = path.match(/^\/mermas\/(\d+)$/);
      if (idm) {
        const id = +idm[1];
        const idx = registros.findIndex((r) => r.id_registro === id);
        if (req.method === "GET") { return idx === -1 ? send(res, 404, { detail: "Registro no encontrado." }) : send(res, 200, registros[idx]); }
        if (req.method === "PUT") {
          if (idx === -1) return send(res, 404, { detail: "Registro no encontrado." });
          let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
          ["tipo_merma", "lote", "linea_prod", "fecha_hora"].forEach((k) => { if (b[k] !== undefined) registros[idx][k] = b[k]; });
          if (b.cant_kg !== undefined) registros[idx].cant_kg = fmt(b.cant_kg);
          return send(res, 200, registros[idx]);
        }
        if (req.method === "DELETE") {
          if (idx === -1) return send(res, 404, { detail: "Registro no encontrado." });
          registros.splice(idx, 1);
          return send(res, 204, null);
        }
      }
    }
    return send(res, 404, { detail: "No encontrado" });
  });
});

server.listen(PORT, () => console.log(`Mock API en http://127.0.0.1:${PORT}`));
