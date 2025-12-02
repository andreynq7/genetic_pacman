// Minimal DOM helpers to keep UI code tidy.
(function() {
  /**
   * Shortcut for `document.getElementById`.
   * @param {string} id - Element identifier.
   * @returns {HTMLElement|null} Matching node or null.
   */
  function getById(id) {
    return document.getElementById(id);
  }

  /**
   * Runs `querySelector` on the provided scope (document by default).
   * @param {string} selector - CSS selector to search.
   * @param {ParentNode} [scope=document] - Optional container element.
   * @returns {Element|null} First match or null.
   */
  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  /**
   * Runs `querySelectorAll` and returns a plain array.
   * @param {string} selector - CSS selector to search.
   * @param {ParentNode} [scope=document] - Optional container element.
   * @returns {Element[]} Array of matching nodes.
   */
  function qsa(selector, scope) {
    return Array.from((scope || document).querySelectorAll(selector));
  }

  /**
   * Creates an element with an optional class assignment.
   * @param {string} tag - Tag name to create.
   * @param {string} [className] - Class string to apply.
   * @returns {HTMLElement} The created element.
   */
  function createElement(tag, className) {
    const el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    return el;
  }

  /**
   * Updates textContent when the element reference exists.
   * @param {HTMLElement} el - Target element.
   * @param {string|number} text - Text to set.
   * @returns {void}
   */
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
