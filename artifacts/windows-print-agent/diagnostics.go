package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func (a *Agent) DiagnosticsHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", a.handleDiagnosticsPage)
	mux.HandleFunc("GET /api/status", a.handleDiagnosticsStatus)
	mux.HandleFunc("POST /api/test-print", a.handleDiagnosticsTestPrint)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !remoteIsLoopback(r.RemoteAddr) {
			http.Error(w, "diagnostics is loopback-only", http.StatusForbidden)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'")
		mux.ServeHTTP(w, r)
	})
}

func (a *Agent) handleDiagnosticsPage(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(diagnosticsHTML))
}

func (a *Agent) handleDiagnosticsStatus(w http.ResponseWriter, _ *http.Request) {
	a.status.mu.RLock()
	status := map[string]any{
		"agent": map[string]any{
			"version":              version,
			"startedAt":            a.status.startedAt,
			"lastAuthorizedServer": a.status.lastServer,
			"lastCommunication":    timeOrNil(a.status.lastCommunication),
			"lastJob":              timeOrNil(a.status.lastJob),
			"lastError":            a.status.lastError,
		},
		"printers": a.config.Printers,
	}
	a.status.mu.RUnlock()
	writeJSON(w, http.StatusOK, status)
}

func (a *Agent) handleDiagnosticsTestPrint(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Piccolo-Diagnostics") != "1" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "cabecera local obligatoria"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	var request struct {
		PrinterID string `json:"printerId"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}
	printer, ok := a.printerMap[strings.ToLower(request.PrinterID)]
	if !ok || !printer.Enabled {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "impresora desconocida o deshabilitada"})
		return
	}
	payload := []byte("\x1b@PICCOLO PRINT AGENT\nPRUEBA LOCAL " +
		time.Now().Format(time.RFC3339) + "\n\n")
	level, err := a.transport.Print(r.Context(), printer, payload, 1)
	if err != nil {
		a.status.mu.Lock()
		a.status.lastError = err.Error()
		a.status.mu.Unlock()
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"accepted": false, "confirmationLevel": "spooler", "error": err.Error(),
		})
		return
	}
	a.status.mu.Lock()
	a.status.lastJob = time.Now().UTC()
	a.status.lastError = ""
	a.status.mu.Unlock()
	a.logger.Printf("diagnostic test accepted printer=%s confirmation=%s", printer.ID, level)
	writeJSON(w, http.StatusOK, map[string]any{
		"accepted": true, "confirmationLevel": level, "error": "",
	})
}

const diagnosticsHTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Piccolo Print Agent — Diagnóstico</title>
<style>
body{font:15px system-ui;margin:2rem;max-width:900px;color:#17202a}h1{margin-bottom:.25rem}
.muted{color:#68737d}.card{border:1px solid #ccd3d8;border-radius:8px;padding:1rem;margin:1rem 0}
button{padding:.5rem .8rem}.error{color:#a51d1d;white-space:pre-wrap}table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #ddd;padding:.5rem;text-align:left}
</style></head><body>
<h1>Piccolo Print Agent</h1><div class="muted">Diagnóstico local. La aceptación no certifica salida física.</div>
<div class="card" id="agent">Cargando…</div>
<div class="card"><h2>Impresoras</h2><table><thead><tr><th>Nombre / UUID</th><th>Target</th><th>Estado</th><th></th></tr></thead><tbody id="printers"></tbody></table></div>
<div id="message" class="error"></div>
<script>
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function refresh(){
 const r=await fetch('/api/status',{cache:'no-store'}), d=await r.json(), a=d.agent;
 document.querySelector('#agent').innerHTML='<b>Versión:</b> '+esc(a.version)+'<br><b>Inicio:</b> '+esc(a.startedAt)+
 '<br><b>Último servidor autorizado:</b> '+esc(a.lastAuthorizedServer||'—')+
 '<br><b>Última comunicación:</b> '+esc(a.lastCommunication||'—')+'<br><b>Último trabajo:</b> '+esc(a.lastJob||'—')+
 '<br><b>Último error:</b> '+esc(a.lastError||'—');
 document.querySelector('#printers').innerHTML=d.printers.map(p=>'<tr><td>'+esc(p.name||p.id)+'<br><small>'+esc(p.id)+
 '</small></td><td>'+esc(p.target.type==='tcp'?p.target.address:p.target.queueName)+'</td><td>'+(p.enabled?'habilitada':'deshabilitada')+
 '</td><td><button '+(p.enabled?'':'disabled')+' onclick="testPrint(\''+esc(p.id)+'\')">Imprimir prueba</button></td></tr>').join('');
}
async function testPrint(id){
 const m=document.querySelector('#message');m.textContent='Enviando prueba…';
 const r=await fetch('/api/test-print',{method:'POST',headers:{'Content-Type':'application/json','X-Piccolo-Diagnostics':'1'},body:JSON.stringify({printerId:id})});
 const d=await r.json();m.textContent=d.accepted?'Prueba aceptada ('+d.confirmationLevel+'). Verifique físicamente la impresora.':d.error;refresh();
}
refresh().catch(e=>document.querySelector('#message').textContent=e);
</script></body></html>`
