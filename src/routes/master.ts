// Existing code... 
function renderDetTab(tab) {
    // Other code...

    // Fix the syntax error
    const _curCliId = getCurrentClientId(); // Assuming this function gives the correct client ID
    const button = document.createElement('button');
    button.innerHTML = 'Novo Chamado';
    button.onclick = function() {
        // Use _curCliId instead of id
        viewTicket(_curCliId);
    };
    // More code...
}
// continue with existing content...