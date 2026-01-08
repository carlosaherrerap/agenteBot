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
     * Triggered by keywords: hola, bolas, buenos, buenas, información, día, soy
     * Two separate messages as per spec
     */
    greetingNeutral() {
        return [
            `Hola, Soy *Max* 🤖, tu asistente virtual.\nTe saludamos de *InformaPeru*.`,
            `Para ayudarte con tu consulta, necesito tu *DNI* o *número de cuenta*.`
        ];
    },

    /**
     * When user sends a query without document identification
     * Triggered when message contains query keywords (pagar, quiero, debes, cuota, etc.)
     * but no DNI/RUC number
     */
    queryWithoutDocument() {
        return `Lo siento, te escucho 👂, pero para ayudarte con tu consulta, necesito que primero me brindes tu *DNI* o *número de cuenta* para verificar en el sistema 🔍`;
    },

    /**
     * Main menu after client identified
     * @param {string} name - Customer first name from NOMBRE_CLIENTE
     */
    greetingWithName(name) {
        return [
            `*${name.toUpperCase()}* 😊 Para continuar con la atención solicitada una opción a escribir:\n(Recuerde siempre los números)`,
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
     * Validates: 8 digits = DNI, 11 digits = RUC
     */
    invalidNumberLength() {
        return `El número ingresado no es válido ❌\n\nCondición de validación: el número debe contener 8 o 11 dígitos\n\nPor favor ingresa:\n• *DNI*: 8 dígitos\n• *RUC*: 11 dígitos`;
    },

    /**
     * Client not found in database
     * Shows after DB search returns no results
     */
    clientNotFound() {
        return `No se encuentra información con este número. Vuelve a intentar. 🔍`;
    },

    /**
     * Request document/ID
     * Used when bot needs to re-request identification
     */
    askForDocument() {
        return `Por favor, bríndame tu *DNI* o *número de cuenta* para verificar en el sistema 🔍`;
    },

    /**
     * Debt details sub-menu (Option 1)
     * Sub-options: 1=Saldo Capital, 2=Cuota Pendiente, 3=Días de Atraso
     */
    debtDetailsMenu() {
        return [
            `📋 *Consulta de Deuda*\nEscribe el número de la información que deseas ver:`,
            `1️⃣ Saldo Capital\n2️⃣ Cuota Pendiente\n3️⃣ Días de Atraso`,
            `Escribe *0* para regresar al menú principal 🔙`
        ];
    },

    /**
     * Saldo Capital response
     * @param {string|number} amount - Saldo capital amount
     */
    debtSaldoCapital(amount) {
        return [
            `💰 Tu *Saldo Capital* es:\n*S/ ${amount}*`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Cuota Pendiente response
     * @param {string|number} amount - Cuota pendiente amount
     */
    debtCuotaPendiente(amount) {
        return [
            `📅 Tu *Cuota Pendiente* es:\n*S/ ${amount}*`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Días de atraso response
     * @param {string|number} days - Number of days overdue
     */
    debtDiasAtraso(days) {
        return [
            `⏰ Tienes *${days} días* de atraso.`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Offices information - Caja Huancayo (Option 2)
     * Lists all available offices with addresses and hours
     */
    officesInfo() {
        return [
            `📍 *Oficinas Caja Huancayo*`,
            `🏢 *Huancayo - Centro*\n   Jr. Real 789, Plaza Constitución\n   Lun-Sab 8:00am - 6:00pm`,
            `🏢 *Huancayo - El Tambo*\n   Av. Huancavelica 321\n   Lun-Sab 8:00am - 6:00pm`,
            `🏢 *Junín - Tarma*\n   Jr. Lima 555\n   Lun-Vie 9:00am - 5:00pm`,
            `📞 *Central*: 01-6XO-8130`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Update phone - service not available (Option 3)
     */
    updatePhoneRequest() {
        return [
            `⚠️ *Servicio aún no disponible.*\nAcércate a nuestras oficinas para cambiar tu número de teléfono.`,
            `Escribe *0* para volver al menú principal 🔙`
        ];
    },

    /**
     * Advisor transfer - requires DNI + query (Option 4)
     */
    advisorRequest() {
        return [
            `Para derivarte con un asesor, necesita tu *DNI* y tu *consulta* en un solo mensaje.`,
            `Ejemplo: *"75747335, quiero reprogramar mi deuda"*`,
            `Escribe *0* para regresar al menú principal 🔙`
        ];
    },

    /**
     * Advisor confirmation after sending request
     */
    advisorTransferConfirm() {
        return [
            `Listo ✅\nSe te está derivando con un asesor personalizado.\n\n⏳ Te contactaremos en:\n• *Junio - Tarma*: Lun-Vie 9:00am - 6:00pm\n• *Huancayo*: Lun-Sab 8:00am - 6:00pm`,
            `Escribe *0* para regresar al menú principal 🔙`
        ];
    },

    /**
     * Session expired message
     * Sent after 2 minutes of inactivity
     */
    sessionExpired() {
        return `Tu sesión ha expirado por inactividad ⏰\nPor favor, escríbenos nuevamente para continuar. 👋`;
    },

    /**
     * Security lock - user tries to change DNI while already identified
     * Prevents querying different documents within the same session
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
     * Response when user asks about unrelated topics
     */
    onlyDebtInfo() {
        return `Solo puedo brindarte información referente a tu deuda y orientarte a pagarlas.\n¡Gracias! 😊`;
    },

    /**
     * Invalid menu option
     * When user enters a number that's not a valid option
     */
    invalidMenuOption() {
        return `Por favor, selecciona una opción válida del menú (1, 2, 3 o 4) 🔢\nEscribe *0* para ver el menú nuevamente.`;
    },

    /**
     * Invalid debt submenu option
     * When user enters invalid option in debt details submenu
     */
    invalidDebtOption() {
        return `Por favor, selecciona una opción válida (1, 2, 3) o escribe *0* para volver al menú principal 🔙`;
    }
};

module.exports = templates;
