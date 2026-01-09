/**
 * Message Templates for InformaPeru Chatbot - Max
 * Bot: Max - Asistente Virtual de InformaPeru/Caja Huancayo
 * 
 * Templates can return:
 * - A single string (one message)
 * - An array of strings (multiple messages sent separately)
 */

const templates = {
    // ==================== FASE 1: SALUDO ====================

    /**
     * Saludo inicial - FASE 1
     * Se muestra al inicio de toda conversación
     */
    greetingPhase1() {
        return [
            `Hola, Soy Max 😊Tu asistente virtual de InformaPeru🤖`,
            `Para ayudarte con tu consulta, necesito tu *DNI*, *RUC* o *Número de cuenta.*`
        ];
    },

    /**
     * Mensaje cuando el cliente da un saludo simple
     * hola, buenas noches, informaperu, caja huancayo, hola {nombre}
     */
    greetingNeutral() {
        return [
            `Hola, Soy Max 😊Tu asistente virtual de InformaPeru🤖`,
            `Para ayudarte con tu consulta, necesito tu *DNI*, *RUC* o *Número de cuenta.*`
        ];
    },

    // ==================== FASE 2: VALIDACIÓN ====================

    /**
     * Solicitar documento nuevamente
     */
    askForDocument() {
        return `Para ayudarte con tu consulta, necesito tu *DNI*, *RUC* o *Número de cuenta.*`;
    },

    /**
     * Error de longitud de número (no es 8, 11 o 18 dígitos)
     */
    invalidDocumentLength() {
        return `🪪Por favor ingresa un número de documento correcto(8 dígitos) o cuenta(18 dígitos)`;
    },

    /**
     * Número inválido - mensaje alternativo
     */
    invalidNumberLength() {
        return `🪪Por favor ingresa un número de documento correcto(8 dígitos) o cuenta(18 dígitos)`;
    },

    /**
     * Datos incorrectos cuando no es una consulta válida
     */
    invalidDataNotQuery() {
        return `Datos incorrectos, asegurate de ingresar un número de 8 dígitos para *DNI*, 11 para *RUC* o 18 para *cuenta*`;
    },

    /**
     * Sugerencia para carnet de extranjería
     */
    foreignDocumentSuggestion() {
        return `Comprendo tu situación, para ello te puedo sugerir ingresar usando tu *NÚMERO DE CUENTA* o acercarte a las oficinas de Caja Huancayo para que te brinden un ID de sesión por WhatsApp.`;
    },

    /**
     * No se tiene información sobre la consulta
     */
    noInfoAvailable() {
        return `No tengo información o permisos sobre ello, te recomiendo consultarlo con un asesor.\nPara derivarte con un asesor, necesito tu DNI y tu consulta en un solo mensaje.\nEjemplo: "75747335, horarios de atención"`;
    },

    /**
     * Cliente no encontrado en base de datos
     */
    clientNotFound() {
        return `😿Lo sentimos. No hemos encontrado información de usted. Intente con otro documento`;
    },

    /**
     * Bloqueo por demasiados intentos (4 intentos fallidos)
     */
    tooManyAttempts() {
        return `⚠️Hemos detectado múltiples intentos de verificación con diferentes números de documento.\nEsta acción infringe nuestras políticas de seguridad y protección de datos. Por su seguridad y la de terceros, le informamos que no podrá realizar nuevas identificaciones en los próximos 30 minutos.`;
    },

    /**
     * Seguridad - usuario intenta consultar otro documento
     */
    securityBlockOtherDocument() {
        return `⚠️Usted no tiene permiso para consultar información de otra persona`;
    },

    /**
     * Alias para compatibilidad
     */
    securityLock() {
        return `⚠️Usted no tiene permiso para consultar información de otra persona`;
    },

    // ==================== FASE 3: MENÚ CONTEXTUAL ====================

    /**
     * Menú principal con nombre del cliente
     * @param {string} name - Nombre del cliente
     */
    mainMenuWithName(name) {
        return [
            `*${name.toUpperCase()}* 😊 Para continuar con la atención escribe un número de la lista o escribe brevemente tu consulta(por ejm: Deseo reprogramar mi deuda)`,
            `1️⃣ Detalles deuda\n2️⃣ Oficinas cercanas\n3️⃣ Actualizar teléfono\n4️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Menú principal sin mensaje de bienvenida (para regresar)
     * @param {string} name - Nombre del cliente
     */
    menuOptions(name) {
        return [
            `*${name.toUpperCase()}* 😊 Para continuar con la atención escribe un número de la lista`,
            `1️⃣ Detalles deuda\n2️⃣ Oficinas cercanas\n3️⃣ Actualizar teléfono\n4️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Alias para greetingWithName para compatibilidad
     */
    greetingWithName(name) {
        return [
            `*${name.toUpperCase()}* 😊 Para continuar con la atención escribe un número de la lista o escribe brevemente tu consulta(por ejm: Deseo reprogramar mi deuda)`,
            `1️⃣ Detalles deuda\n2️⃣ Oficinas cercanas\n3️⃣ Actualizar teléfono\n4️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Submenú de detalles de deuda
     */
    debtDetailsMenu() {
        return [
            `1️⃣ Saldo Capital\n2️⃣ Cuota Pendiente\n3️⃣ Días de Atraso\n4️⃣ Regresar al menú anterior`
        ];
    },

    /**
     * Saldo Capital
     * @param {string|number} amount - Monto del saldo capital
     */
    debtSaldoCapital(amount) {
        return `💰 Tu Saldo Capital es: S/ ${amount}`;
    },

    /**
     * Cuota Pendiente
     * @param {string|number} amount - Monto de la cuota pendiente
     */
    debtCuotaPendiente(amount) {
        return `📅 Tu Cuota Pendiente es: S/ ${amount}`;
    },

    /**
     * Días de Atraso
     * @param {string|number} days - Número de días de atraso
     */
    debtDiasAtraso(days) {
        return `⏰ Tienes ${days} días de atraso.`;
    },

    /**
     * Información de oficinas - Caja Huancayo
     */
    officesInfo() {
        return [
            `📍 *Oficinas Caja Huancayo*`,
            `🏢 *Lima - San Isidro*\n   Av. Javier Prado Este 123\n   Lun-Vie 9:00am - 6:00pm\n\n🏢 *Lima - Miraflores*\n   Av. Larco 456\n   Lun-Vie 9:00am - 6:00pm`,
            `🏢 *Huancayo - Centro*\n   Jr. Real 789, Plaza Constitución\n   Lun-Sab 8:00am - 6:00pm\n\n🏢 *Huancayo - El Tambo*\n   Av. Huancavelica 321\n   Lun-Sab 8:00am - 6:00pm`,
            `🏢 *Junín - Tarma*\n   Jr. Lima 555\n   Lun-Vie 9:00am - 5:00pm\n\n📞 Central: 01-XXX-XXXX\n\nEscribe 0 para volver al menú principal 👈`
        ];
    },

    /**
     * Actualizar teléfono - servicio no disponible
     */
    updatePhoneUnavailable() {
        return `⚠️ Servicio aún no disponible.\nPor favor, acércate a una de nuestras oficinas para actualizar tu número de teléfono.`;
    },

    /**
     * Alias para compatibilidad
     */
    updatePhoneRequest() {
        return [
            `⚠️ Servicio aún no disponible.\nPor favor, acércate a una de nuestras oficinas para actualizar tu número de teléfono.`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Solicitud de asesor - requiere DNI + consulta
     */
    advisorRequest() {
        return [
            `Para derivarte con un asesor, necesito tu DNI y tu consulta en un solo mensaje.`,
            `Ejemplo: "DNI 12345678, quiero reprogramar mi deuda"`
        ];
    },

    /**
     * Documento inválido para derivar a asesor
     */
    invalidDocumentForAdvisor() {
        return `⚠️Por favor, escriba un documento válido`;
    },

    /**
     * Confirmación de derivación a asesor
     */
    advisorTransferConfirm() {
        return [
            `Listo ✅\nSe te está derivando con un asesor personalizado.\n\n⏳ Te contactaremos en horario de oficina.`,
            `Escribe *0* para regresar al menú principal 🔙`
        ];
    },

    /**
     * Sesión expirada por inactividad
     */
    sessionExpired() {
        return `Su sesión ha expirado por inactividad 🕰️ Estaremos aquí para cuando necesite ayuda u orientación. Hasta pronto👋`;
    },

    /**
     * Opción de menú inválida
     */
    invalidMenuOption() {
        return `Opción inválida, por favor elige un número(por ejemplo: 4)`;
    },

    /**
     * Opción inválida en submenú de deuda
     */
    invalidDebtOption() {
        return `Por favor, selecciona una opción válida (1, 2, 3, 4)`;
    },

    /**
     * Error fallback
     */
    errorFallback() {
        return `Lo siento, estoy experimentando dificultades técnicas 😅\nPor favor, intenta de nuevo o escribe *"asesor"* para comunicarte con un representante.`;
    },

    /**
     * Solo información de deuda disponible
     */
    onlyDebtInfo() {
        return `Solo puedo brindarte información referente a tu deuda y orientarte a pagarlas.\n¡Gracias! 😊`;
    },

    /**
     * Consulta sin documento - alias para compatibilidad
     */
    queryWithoutDocument() {
        return `Para ayudarte con tu consulta, necesito tu *DNI*, *RUC* o *Número de cuenta.*`;
    }
};

module.exports = templates;
