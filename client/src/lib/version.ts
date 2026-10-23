// Versión de la base de datos que este código espera. Cuando se agrega una
// mejora que necesita cambios en la base, se sube este número y se suma al final de
// database/actualizar.sql (y de database/instalar.sql) un `insert ... esquema_version`
// con el mismo número. Si la base es más vieja, el CRM muestra el aviso de actualizar.
export const VERSION_BASE_ESPERADA = 6;
