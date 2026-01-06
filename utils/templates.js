/**
 * Message Templates for InformaPeru Chatbot
 * All bot responses are centralized here for easy maintenance
 * 
 * Templates can return:
 * - A single string (one message)
 * - An array of strings (multiple messages sent separately)
 */

const templates = {
    /**
     * First greeting - neutral (no client identified)
     * Two separate messages as per spec
     */
    greetingNeutral() {
        return [
            `Hola, Soy *Max* 😊, tu asistente virtual 🤖\nTe saludamos de *InformaPeru*.`,
            `Para ayudarte con tu consulta, necesito tu *DNI* o *número de cuenta*.`
        ];
    },

    /**
     * Main menu after client identified
     * @param {string} name - Customer first name from NOMBRE_CLIENTE
     */
    greetingWithName(name) {
        return [
            `*${name.toUpperCase()}* 😊 Para continuar con la consulta selecciona un número`,
            `1️⃣ Detalles deuda\n2️⃣ Oficinas cercanas\n3️⃣ Actualizar teléfono\n4️⃣ Comunicarse con un asesor`,
            `_Como método de seguridad solo se puede consultar 1 documento (DNI, RUC) 🛡️\no espera 2 minutos hasta cerrar sesión para volver a consultar un documento diferente_`
        ];
    },

    /**
     * Menu options only (for returning to menu)
     * @param {string} name - Customer first name
     */
    menuOptions(name) {
        return [
            `*${name.toUpperCase()}* 😊 Para continuar selecciona una opción:`,
            `1️⃣ Detalles deuda\n2️⃣ Oficinas cercanas\n3️⃣ Actualizar teléfono\n4️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Invalid number length error (not 8 or 11 digits)
     */
    invalidNumberLength() {
        return `El número ingresado no es válido ❌\n\nPor favor ingresa:\n• *DNI*: 8 dígitos (Ej: 12345678)\n• *RUC*: 11 dígitos (Ej: 20123456789)`;
    },

    /**
     * Client not found in database
     */
    clientNotFound() {
        return `No se ha encontrado datos para este número. Vuelva a intentar. 🔍`;
    },

    /**
     * Request document/ID
     */
    askForDocument() {
        return `Por favor, bríndame tu *DNI* o *número de cuenta* para verificar en el sistema 🔍`;
    },

    /**
     * Debt details sub-menu
     */
    debtDetailsMenu() {
        return [
            `📋 *Consulta de Deuda*\nSelecciona qué información deseas ver:`,
            `1️⃣ Saldo Capital\n2️⃣ Cuota Pendiente\n3️⃣ Días de Atraso`,
            `Escribe *0* para regresar al menú principal 🔙`
        ];
    },

    /**
     * Individual debt detail responses
     */
    debtSaldoCapital(amount) {
        return [
            `💰 Tu Saldo Capital es: *S/ ${amount}*`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    debtCuotaPendiente(amount) {
        return [
            `📅 Tu Cuota Pendiente es: *S/ ${amount}*`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    debtDiasAtraso(days) {
        return [
            `⏰ Tienes *${days} días* de atraso.`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Offices information - Caja Huancayo
     */
    officesInfo() {
        return [
            `📍 *Oficinas Caja Huancayo*`,
            `🏢 *Lima - San Isidro*\n   Av. Javier Prado Este 123\n   Lun-Vie 9:00am - 6:00pm\n\n🏢 *Lima - Miraflores*\n   Av. Larco 456\n   Lun-Vie 9:00am - 6:00pm`,
            `🏢 *Huancayo - Centro*\n   Jr. Real 789, Plaza Constitución\n   Lun-Sab 8:00am - 6:00pm\n\n🏢 *Huancayo - El Tambo*\n   Av. Huancavelica 321\n   Lun-Sab 8:00am - 6:00pm`,
            `🏢 *Junín - Tarma*\n   Jr. Lima 555\n   Lun-Vie 9:00am - 5:00pm`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Update phone - service not available
     */
    updatePhoneRequest() {
        return [
            `⚠️ *Servicio aún no disponible.*\nPor favor, acércate a una de nuestras oficinas para actualizar tu número de teléfono.`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Advisor transfer - requires DNI + query
     */
    advisorRequest() {
        return [
            `Para derivarte con un asesor, necesito tu *DNI* y tu *consulta* en un solo mensaje.`,
            `Ejemplo: *"75747335, quiero reprogramar mi deuda"*`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Advisor confirmation after sending email
     */
    advisorTransferConfirm() {
        return [
            `Listo ✅\nSe te está derivando con un asesor personalizado.\nTe contactaremos pronto. 📞`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Session expired message
     */
    sessionExpired() {
        return `Tu sesión ha expirado por inactividad ⏰\nPor favor, escríbenos nuevamente para continuar. 👋`;
    },

    /**
     * Security lock - user tries to change DNI while already identified
     */
    securityLock() {
        return `Por motivos de seguridad debes esperar *2 minutos* para volver a intentar con otro documento 🕰️\n\n_Escribe *0* para continuar con tu consulta actual o espera el tiempo indicado._`;
    },

    /**
     * Error fallback
     */
    errorFallback() {
        return `Lo siento, estoy experimentando una alta demanda 😅\nPor favor, intenta de nuevo o escribe *"asesor"* para comunicarte con un representante.`;
    },

    /**
     * Only debt information available
     */
    onlyDebtInfo() {
        return `Solo puedo brindarte información referente a tu deuda y orientarte a pagarlas.\n¡Gracias! 😊`;
    }
};

module.exports = templates;
