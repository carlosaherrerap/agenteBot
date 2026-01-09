/**
 * Message Templates for InformaPeru Chatbot - Max
 * Bot: Max - Asistente Virtual de InformaPeru/Caja Huancayo
 *
 * Templates can return:
 * - A single string (one message)
 * - An array of strings (multiple messages sent separately)
 * 
 * Response Variation System to avoid bot detection by Meta
 */

// ==================== VARIACIÓN DE RESPUESTAS ====================
// Configuración de frecuencia de emojis (0.0 = nunca, 1.0 = siempre)
const EMOJI_FREQUENCY = 0.7; // 70% de las veces incluir emojis

/**
 * Selecciona aleatoriamente una variante de un array
 * @param {Array} variants - Array de variantes
 * @returns {string} Una variante aleatoria
 */
function pickRandom(variants) {
    return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Decide si incluir emoji basado en frecuencia
 * @param {string} withEmoji - Versión con emoji
 * @param {string} withoutEmoji - Versión sin emoji
 * @returns {string} Una de las dos versiones
 */
function maybeEmoji(withEmoji, withoutEmoji) {
    return Math.random() < EMOJI_FREQUENCY ? withEmoji : withoutEmoji;
}


const templates = {
    // ==================== FASE 1: SALUDO ====================
    /**
     * Saludo inicial - FASE 1
     * Se muestra al inicio de toda conversación (CON VARIACIONES)
     */
    greetingPhase1() {
        const saludos = [
            `Hola, Soy Max ${maybeEmoji('😊', '')} Tu asistente virtual de InformaPeru${maybeEmoji('🤖', '')}`,
            `Hola! Soy Max, tu asistente de InformaPeru${maybeEmoji(' 👋', '')}`,
            `Bienvenido a InformaPeru${maybeEmoji(' 🏦', '')} Soy Max, tu asistente virtual`,
            `Hola! Te saluda Max de InformaPeru${maybeEmoji(' 😊', '')}`
        ];
        const solicitudes = [
            `Para ayudarte, necesito tu *DNI*, *RUC* o *Número de cuenta*`,
            `Para continuar, por favor indícame tu *DNI*, *RUC* o *cuenta*`,
            `Para asistirte, necesito tu documento de identidad (*DNI*, *RUC* o *cuenta*)`
        ];
        return [pickRandom(saludos), pickRandom(solicitudes)];
    },

    /**
     * Mensaje cuando el cliente da un saludo simple
     */
    greetingNeutral() {
        const saludos = [
            `Hola! Soy Max${maybeEmoji(' 😊', '')} Tu asistente virtual de InformaPeru`,
            `Buen día! Soy Max, tu asistente de InformaPeru${maybeEmoji(' 👋', '')}`,
            `Hola! Te saluda Max de InformaPeru${maybeEmoji(' 🤖', '')}`
        ];
        const solicitudes = [
            `Para ayudarte con tu consulta, necesito tu *DNI*, *RUC* o *Número de cuenta*`,
            `Por favor, indícame tu *DNI*, *RUC* o *cuenta* para continuar`
        ];
        return [pickRandom(saludos), pickRandom(solicitudes)];
    },

    // ==================== FASE 2: VALIDACIÓN ====================
    /**
     * Solicitar documento nuevamente (CON VARIACIONES)
     */
    askForDocument() {
        const variantes = [
            `Para ayudarte, necesito tu *DNI*, *RUC* o *Número de cuenta*`,
            `Por favor, indícame tu *DNI*, *RUC* o *cuenta*`,
            `Necesito tu documento de identidad (*DNI*, *RUC* o *cuenta*) para continuar`,
            `Escríbeme tu *DNI*, *RUC* o *cuenta* para poder ayudarte`
        ];
        return pickRandom(variantes);
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

    // New template for phase 2 security block (same message)
    securityBlockOtherDocumentPhase2() {
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
            `Ejemplo: *"12345678, quiero reprogramar mi deuda"*`,
            `Escribe *0* para volver al menú principal 🔙`
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
            `Listo ${maybeEmoji('✅', '')}\\nSe te está derivando con un asesor personalizado.\\n\\n${maybeEmoji('⏳', '')} Te contactaremos en horario de oficina.`,
            `Escribe *0* para regresar al menú principal ${maybeEmoji('🔙', '')}`
        ];
    },

    /**
     * Confirmación de derivación a asesor - Variante (para FASE 2 cuando ya dan DNI+consulta)
     */
    advisorTransferConfirmVariant() {
        const confirmaciones = [
            `Se te ha derivado con un asesor ${maybeEmoji('🦸', '')} Nos pondremos en contacto contigo en breve.`,
            `Listo! Un asesor personalizado se comunicará contigo pronto ${maybeEmoji('📞', '')}`,
            `Tu solicitud fue enviada ${maybeEmoji('✅', '')} Un asesor te contactará en horario de oficina.`,
            `Recibido! Te derivamos con un asesor que atenderá tu caso ${maybeEmoji('👨‍💼', '')}`
        ];
        return pickRandom(confirmaciones);
    },

    /**
     * Sesión expirada por inactividad (2 minutos)
     */
    sessionExpired() {
        return `Tu sesión ha expirado por inactividad ⏰\nPor favor, escríbenos nuevamente para continuar. Estamos aquí para solucionar tus consultas o vuelve pronto cuando nos necesites 👋`;
    },

    /**
     * Groserías o insultos detectados
     * Respuesta amable para calmar al usuario
     */
    profanityDetected() {
        return [
            `Entiendo que puedas estar frustrado 😔 pero me gustaría ayudarte de la mejor manera.`,
            `Por favor, cuéntame tu consulta con calma y haré todo lo posible por asistirte. Estoy aquí para ayudarte 🤝`
        ];
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
     * Opción inválida - sugerir volver al menú
     */
    invalidOptionGoBack() {
        return `Opción no válida. Escribe *0* para volver al menú principal 🔙`;
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
