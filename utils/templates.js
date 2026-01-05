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
     * Greeting with customer name (found in database)
     * Returns array for multiple messages
     * @param {string} name - Customer name from NOMBRE_CLIENTE
     */
    greetingWithName(name) {
        return [
            `Hola, *${name}* 😊 Soy Max, tu asistente virtual 🤖\nTe saludamos de *InformaPeru*.`,
            `Para ayudarte escribe brevemente tu consulta *"Quiero pagar mi deuda"* o selecciona una opción:`,
            `1️⃣ Detalles deuda\n2️⃣ Oficinas cercanas\n3️⃣ Actualizar teléfono\n4️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Neutral greeting (phone not found in database)
     */
    greetingNeutral() {
        return [
            `Hola, Soy Max 😊, tu asistente virtual 🤖\nTe saludamos de *InformaPeru*.`,
            `Para ayudarte con tu consulta, necesito tu *DNI* o *número de cuenta*.`
        ];
    },

    /**
     * Menu options (after customer identified)
     * @param {string} name - Optional customer name
     */
    menuOptions(name = null) {
        const greeting = name ? `${name} 😊 ` : '';
        return [
            `${greeting}Para continuar con la atención selecciona una opción:`,
            `1️⃣ Detalles deuda\n2️⃣ Oficinas cercanas\n3️⃣ Actualizar teléfono\n4️⃣ Comunicarse con un asesor`
        ];
    },

    /**
     * Debt details sub-menu (not all info at once)
     */
    debtDetailsMenu() {
        return [
            `📋 *Consulta de Deuda*\nSelecciona qué información deseas ver:`,
            `1️⃣ Saldo Capital\n2️⃣ Cuota Pendiente\n3️⃣ Días de Atraso\n\nEscribe *0* para regresar al menú principal 🔙`
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
     * Request account number
     */
    askForAccount() {
        return `Voy a requerir tu *número de cuenta* para terminar con la validación 😊`;
    },

    /**
     * Request document/ID
     */
    askForDocument() {
        return `Por favor, bríndame tu *DNI* o *número de cuenta* para verificar en el sistema 🔍`;
    },

    /**
     * Invalid phone length error
     */
    invalidPhoneLength() {
        return `El número de teléfono brindado es incorrecto ❌\nDebe poseer *9 dígitos* empezando sin el prefijo o símbolos:\nEjemplo: *9XX-XXX-XXX*`;
    },

    /**
     * Invalid document length error (DNI should be 8, RUC should be 11)
     */
    invalidDocumentLength() {
        return `El número brindado es incorrecto ❌\nPor favor ingresa:\n• *DNI*: 8 dígitos (Ej: 12345678)\n• *RUC*: 11 dígitos (Ej: 20123456789)\n• *N° Cuenta*: 18 dígitos`;
    },

    /**
     * Invalid account length error
     */
    invalidAccountLength() {
        return `El número de cuenta ingresado es incorrecto ❌\nDebe poseer *18 dígitos*.\nPor favor, verifica bien y vuelve a intentar.`;
    },

    /**
     * Invalid RUC format (11 digits but wrong prefix)
     */
    invalidRucFormat() {
        return `El RUC ingresado no tiene el formato correcto ❌\nEl RUC debe empezar con *10* (persona natural) o *20* (empresa).\nEjemplo: *10123456789* o *20123456789*`;
    },

    /**
     * Phone/account not found - no debt
     */
    noDebtFound() {
        return `¡Felicitaciones! 🎉\nUsted *no tiene una deuda pendiente* 😊`;
    },

    /**
     * Client not found in database
     */
    clientNotFound() {
        return `Lo siento, no encontré información asociada a ese número 😔\nPor favor, verifica que esté correcto o intenta con tu *número de cuenta*.`;
    },

    /**
     * Session expired message (sent via WhatsApp)
     */
    sessionExpired() {
        return `Tu sesión ha expirado por inactividad ⏰\nPor favor, escríbenos nuevamente para continuar. 👋`;
    },

    /**
     * Offices information - Caja Huancayo
     */
    officesInfo() {
        return [
            `📍 *Oficinas Caja Huancayo*`,
            `🏢 *Lima - San Isidro*\n   Av. Javier Prado Este 123\n   Lun-Vie 9:00am - 6:00pm\n\n🏢 *Lima - Miraflores*\n   Av. Larco 456\n   Lun-Vie 9:00am - 6:00pm`,
            `🏢 *Huancayo - Centro*\n   Jr. Real 789, Plaza Constitución\n   Lun-Sab 8:00am - 6:00pm\n\n🏢 *Huancayo - El Tambo*\n   Av. Huancavelica 321\n   Lun-Sab 8:00am - 6:00pm`,
            `🏢 *Junín - Tarma*\n   Jr. Lima 555\n   Lun-Vie 9:00am - 5:00pm\n\n📞 Central: 01-XXX-XXXX`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Update phone - service not available
     */
    updatePhoneRequest() {
        return [
            `⚠️ Servicio aún no disponible.\nPor favor, acércate a una de nuestras oficinas para actualizar tu número de teléfono.`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Advisor transfer - requires DNI + query FIRST
     */
    advisorRequest() {
        return [
            `Para derivarte con un asesor, necesito tu *DNI* y tu *consulta* en un solo mensaje.`,
            `Ejemplo: *"75747335, quiero reprogramar mi deuda"*\n\nEscribe *0* para volver al menú principal 🔙`
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
     * Only debt information available
     */
    onlyDebtInfo() {
        return `Solo puedo brindarte información referente a tu deuda y orientarte a pagarlas.\n¡Gracias! 😊`;
    },

    /**
     * Group message ignored
     */
    groupMessageIgnored() {
        return null; // Don't respond to groups
    },

    /**
     * Error fallback
     */
    errorFallback() {
        return `Lo siento, estoy experimentando una alta demanda 😅\nPor favor, intenta de nuevo o escribe *"asesor"* para comunicarte con un representante.`;
    }
};

module.exports = templates;
