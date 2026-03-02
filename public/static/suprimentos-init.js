// Quotations Module

const quotations = {
    getQuote: function() {
        return "This is an example of a quote that is returned from the getQuote method.";
    },
    getAuthor: function() {
        return "Author Name";
    },
    getAllQuotes: function() {
        return [
            { quote: "First quote example.", author: "First Author" },
            { quote: "Second quote example.", author: "Second Author" }
        ];
    }
};

module.exports = quotations;