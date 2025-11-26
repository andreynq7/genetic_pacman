// Minimal DOM helpers to keep UI code tidy.
(function() {
  function getById(id) {
    return document.getElementById(id);
  }

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.from((scope || document).querySelectorAll(selector));
  }

  function createElement(tag, className) {
    const el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    return el;
  }

  function setText(el, text) {
    if (el) {
      el.textContent = text;
    }
  }

  window.domHelpers = {
    getById,
    qs,
    qsa,
    createElement,
    setText
  };
})();
