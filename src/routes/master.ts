// Helper function to safely embed JSON in <script> tags
function safeJsonForScriptTag(value) {
    return JSON.stringify(value)
        .replace(/<\/\/g, '<\\/')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

const masterClientsData = safeJsonForScriptTag(clients);
const plansData = safeJsonForScriptTag(PLANS);

// Rest of your master page content goes here...
// For example:
// <script>
//     console.log(masterClientsData);
//     console.log(plansData);
// </script>
