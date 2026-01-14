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
const EMOJI_FREQUENCY = 0.8; // 70% de las veces incluir emojis

// Emojis para saludos de Max
const GREETING_EMOJIS = ['🧑‍🦱', '🖐️📲', '😊', '😀', '😁', '😊', '🤞', '🖐️', '👋', '🤟'];

/**
 * Selecciona aleatoriamente una variante de un array
 */
function pickRandom(variants) {
    return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Decide si incluir emoji basado en frecuencia
 */
function maybeEmoji(withEmoji, withoutEmoji) {
    return Math.random() < EMOJI_FREQUENCY ? withEmoji : withoutEmoji;
}

/**
 * Obtiene un emoji aleatorio para saludos
 */
function getGreetingEmoji() {
    return pickRandom(GREETING_EMOJIS);
}


const templates = {
    // ==================== FASE 1: SALUDO ====================
    /**
     * Saludo inicial - FASE 1 (CON VARIACIONES)
     */
    greetingPhase1() {
        const emoji = getGreetingEmoji();
        const saludos = [
            `Hola, Soy Max ${emoji} Tu asistente virtual 🤖 de InformaPeru`,
            `Hola! Soy Max ${emoji} tu asistente de InformaPeru`,
            `Bienvenido a InformaPeru ${emoji} Soy Max, tu asistente virtual`,
            `Hola! Te saluda Max de InformaPeru ${emoji}`
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
        const emoji = getGreetingEmoji();
        const saludos = [
            `Hola! Soy Max ${emoji} Tu asistente virtual de InformaPeru`,
            `Buen día! Soy Max ${emoji} tu asistente de InformaPeru`,
            `Hola! Te saluda Max de InformaPeru ${emoji}`
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
     * Error de longitud de número
     */
    invalidDocumentLength() {
        return `Por favor ingresa un número de documento correcto (8 dígitos) o cuenta (18 dígitos)`;
    },

    /**
     * Número inválido - mensaje alternativo
     */
    invalidData() {
        return `Datos incorrectos, asegurate de ingresar un número de 8 dígitos para *DNI*, 11 para *RUC* o 18 para *cuenta*`;
    },

    /**
     * El cliente no es una consulta ni respuesta válida
     */
    invalidDataNotQuery() {
        return `Por favor, escríbeme tu *DNI*, *RUC* o *cuenta* para poder ayudarte`;
    },

    /**
     * Sugerencia para extranjeros
     */
    foreignDocumentSuggestion() {
        return `Si eres extranjero, por favor escribe tu *carnet de extranjería* o *número de cuenta* para poder ayudarte`;
    },

    /**
     * Cliente no encontrado en la base de datos
     */
    clientNotFound() {
        const variantes = [
            `No encontramos información con ese documento. Por favor verifica e intenta nuevamente.`,
            `No encontré registros con ese número. Asegúrate de que esté correcto.`,
            `El documento ingresado no está registrado. Por favor, verifica y vuelve a intentar.`
        ];
        return pickRandom(variantes);
    },

    /**
     * Demasiados intentos fallidos
     */
    tooManyAttempts() {
        return `Has superado el número máximo de intentos. Por favor, intenta más tarde o comunícate con nosotros al 064-481000.`;
    },

    /**
     * Sin información disponible para la consulta
     */
    noInfoAvailable() {
        return [
            `No tengo información o permisos sobre ello, te recomiendo consultarlo con un asesor.`,
            `Para derivarte con un asesor, necesito tu DNI y tu consulta en un solo mensaje.`,
            `Ejemplo: *"75747335, horarios de atención"*`
        ];
    },

    // ==================== FASE 3: MENÚ CONTEXTUAL ====================
    /**
     * Menú principal con nombre del cliente (CON VARIACIONES)
     */
    mainMenuWithName(name) {
        const intros = [
            `*${name.toUpperCase()}* ${maybeEmoji('😊', '')} Para continuar escribe un número de la lista o escribe brevemente tu consulta`,
            `Hola *${name.toUpperCase()}* ${maybeEmoji('👋', '')} Elige una opción o escríbeme tu consulta`,
            `*${name.toUpperCase()}* ${maybeEmoji('🙂', '')} Para atenderte, selecciona una opción o cuéntame tu consulta`
        ];
        return [
            pickRandom(intros),
            `1️⃣ Agencias y medios de pago\n2️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Solo las opciones del menú
     */
    menuOptions(name) {
        return [
            `*${name.toUpperCase()}* ${maybeEmoji('😊', '')} Elige una opción:`,
            `1️⃣ Agencias y medios de pago\n2️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Sub-menú de deuda
     */
    debtSubmenu() {
        return `1️⃣ Saldo Capital\n2️⃣ Cuota Pendiente\n3️⃣ Días de Atraso\n4️⃣ Regresar al menú anterior`;
    },

    /**
     * Mensaje de seguridad al identificarse
     */
    securityInfo() {
        return `ℹ️Le informamos que por motivos de Seguridad y Privacidad si usted tarda 2 minutos para realizar consultas su sesión se cerrará y tendrá que volver a identificarse`;
    },

    /**
     * Resumen completo de deuda solicitado por el usuario
     */
    debtSummary(clientName, saldoCapital, saldoCuota, diasAtraso) {
        return [
            this.debtSummaryPart1(clientName, saldoCapital, saldoCuota, diasAtraso),
            this.debtSummaryPart2(),
            this.debtSummaryPart3(clientName)
        ];
    },

    debtSummaryPart1(clientName, saldoCapital, saldoCuota, diasAtraso) {
        return `💰Tu *Saldo Capital* al día de hoy es: S/ ${saldoCapital}
💸Tu *Cuota* a pagar al día de hoy es: S/ ${saldoCuota}
🗓️Tienes *${diasAtraso} días de atraso.*`;
    },

    debtSummaryPart2() {
        return `🧑‍⚖️Agradeceremos que se ponga al día para evitar interés moratorio.
💳🤳Puedes pagar tus cuentas de Caja Huancayo en sus agencias🏬, usando Yape(buscando "Caja Huancayo" en pagos de servicios con tu código de crédito), en agentes KasNet🏦, y através de otros bancos como BCP, BBVA, Scotiabank e Interbank, o en tiendas como🏪 Tambo+. También puedes usar la Caja Virtual o la App móvil de Caja Huancayo para pagos de servicios y créditos.`;
    },

    debtSummaryPart3(clientName) {
        return `¡Muchas gracias, que tenga buen día! 🎆`;
    },

    /**
     * Saldo Capital
     */
    debtSaldoCapital(saldo) {
        return [
            `${maybeEmoji('💰', '')} Tu Saldo Capital es: S/ ${saldo}`,
            `Escribe *0* para volver al menú principal 👈`
        ];
    },

    /**
     * Cuota Pendiente
     */
    debtCuotaPendiente(cuota) {
        return [
            `${maybeEmoji('📅', '')} Tu Cuota Pendiente es: S/ ${cuota}`,
            `Escribe *0* para volver al menú principal 👈`
        ];
    },

    /**
     * Días de Atraso
     */
    debtDiasAtraso(dias) {
        if (dias > 0) {
            return [
                `${maybeEmoji('⏰', '')} Tienes *${dias} días de atraso*`,
                `Te recomendamos regularizar tu situación lo antes posible.`,
                `Escribe *0* para volver al menú principal 👈`
            ];
        }
        return [
            `${maybeEmoji('🎉', '')} ¡Estás al día! No tienes días de atraso.`,
            `Escribe *0* para volver al menú principal 👈`
        ];
    },

    /**
     * Opción de deuda inválida
     */
    invalidDebtOption() {
        return `Por favor, selecciona una opción válida (1, 2, 3, 4)`;
    },

    /**
     * Información de oficinas
     */
    officesInfo() {
        return [
            `📍 *Oficinas InformaPeru - Caja Huancayo*\n\n*Huancayo Centro:*\nJr. Real 789, Plaza Constitución\nLun-Sab: 8:00am - 6:00pm\n\n*El Tambo:*\nAv. Huancavelica 321\nLun-Sab: 8:00am - 6:00pm\n\n*Junín - Tarma:*\nJr. Lima 555\nLun-Vie: 9:00am - 5:00pm`,
            `📞 *Central telefónica:* 064-481000`,
            `Escribe *0* para volver al menú principal 👈`
        ];
    },

    /**
     * Solicitud de actualización de teléfono
     */
    updatePhoneRequest() {
        return [
            `⚠️ Servicio aún no disponible.\nPor favor, acércate a una de nuestras oficinas para actualizar tu número de teléfono.`,
            `Escribe *0* para volver al menú principal 👈`
        ];
    },

    /**
     * Servicio no disponible para actualizar teléfono
     */
    updatePhoneUnavailable() {
        return `⚠️ Servicio aún no disponible.\nPor favor, acércate a una de nuestras oficinas para actualizar tu número de teléfono.`;
    },

    /**
     * Solicitud de asesor - requiere DNI + consulta
     */
    advisorRequest() {
        return [
            `Para derivarte con un asesor, necesito tu DNI y tu consulta en un solo mensaje.`,
            `Ejemplo: *"12345678, quiero reprogramar mi deuda"*`,
            `Escribe *0* para volver al menú principal 👈`
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
            `Listo ${maybeEmoji('✅', '')}\nSe te está derivando con un asesor personalizado.\n\n${maybeEmoji('⏳', '')} Te contactaremos en horario de oficina.`,
            `Escribe *0* para regresar al menú principal 👈`
        ];
    },

    /**
     * Confirmación de derivación a asesor - Variante
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
     */
    profanityDetected() {
        return [
            `Entiendo que puedas estar frustrado 😔 pero me gustaría ayudarte de la mejor manera.`,
            `Por favor, cuéntame tu consulta con calma y haré todo lo posible por asistirte. Estoy aquí para ayudarte 🤝`
        ];
    },

    /**
     * Respuesta a frases de agradecimiento
     */
    gratitudeResponse(name) {
        return `No hay de que ${name} 😊. Estamos para ayudarte. Cuando tengas otra consulta, hazmela saber 👋`;
    },
    invalidMenuOption() {
        return `Opción inválida, por favor elige un número (por ejemplo: 4)`;
    },

    /**
     * Opción inválida - volver al menú
     */
    invalidOptionGoBack() {
        return `Opción no válida. Escribe *0* para volver al menú principal 👈`;
    },

    /**
     * Bloqueo de seguridad por intentar consultar otro documento en FASE 3
     */
    securityBlockOtherDocument() {
        return `⚠️Usted no tiene permiso para consultar información de otra persona`;
    },

    /**
     * Bloqueo de seguridad en FASE 2
     */
    securityBlockOtherDocumentPhase2() {
        return `⚠️Solo puedes consultar información con tu propio documento`;
    },

    /**
     * Error genérico - fallback
     */
    errorFallback() {
        return `Ocurrió un error. Por favor, intenta nuevamente o comunícate con nosotros al 064-481000.`;
    },

    /**
     * Consulta fuera de contexto - para preguntas que no tienen que ver con cobranzas
     */
    outOfContextQuery() {
        return [
            `No pude entenderte 😞 Para ayudarte, puedes elegir un número:`,
            `1️⃣ Agencias y medios de pago\n2️⃣ Comunicarse con un asesor`
        ];
    }
};

module.exports = templates;
