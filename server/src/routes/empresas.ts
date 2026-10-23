import { Router } from 'express';
import { supabase } from '../supabase/client.js';
import { requiereRol } from '../middleware/autenticacion.js';
import type { EmpresaRow } from '../types/dominio.js';

export const empresasRouter = Router();

// Cada CRM tiene una sola empresa: se crea una vez con `npm run configurar`
// y la base no deja agregar otra (ver el índice `empresas_una_sola` en
// database/instalar.sql). Desde la app solo se edita su marca.

// El dueño edita la marca de su empresa (colores + logo). Se usa el
// empresa_id de la sesión autenticada, nunca uno mandado por el body.
empresasRouter.patch('/empresas/mi-empresa', requiereRol('dueno'), async (req, res) => {
  const { color_primario, color_acento, logo_url, cierre_auto_horas } = req.body;

  // Se actualiza solo lo que llegó: la marca y el cierre automático se guardan
  // desde formularios distintos.
  const cambios: Partial<EmpresaRow> = {};
  if (color_primario !== undefined) cambios.color_primario = color_primario || null;
  if (color_acento !== undefined) cambios.color_acento = color_acento || null;
  if (logo_url !== undefined) cambios.logo_url = logo_url || null;
  if (cierre_auto_horas !== undefined) {
    const horas = cierre_auto_horas === null ? null : Number(cierre_auto_horas);
    if (horas !== null && (!Number.isInteger(horas) || horas < 1 || horas > 720)) {
      return res.status(400).json({ error: 'El cierre automático debe ser entre 1 y 720 horas' });
    }
    cambios.cierre_auto_horas = horas;
  }
  if (Object.keys(cambios).length === 0) return res.status(400).json({ error: 'No hay nada para guardar' });

  try {
    const { error } = await supabase
      .from('empresas')
      .update(cambios)
      .eq('id', req.usuarioAutenticado!.empresa_id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando marca de la empresa:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});
