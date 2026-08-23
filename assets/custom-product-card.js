/* ==========================================================================
   Custom Product Card — vanilla JS controller for the quick-view popup
   ========================================================================== */

(function () {
  'use strict';

  // Fallback colour map for common variant names that aren't valid CSS
  // colour keywords on their own (e.g. "Navy", "Royal Blue"). Anything not
  // listed here is tested with CSS.supports() and falls back to grey.
  var COLOR_MAP = {
    navy: '#1b2a52',
    'royal blue': '#1b3faf',
    denim: '#3b5f8a',
    charcoal: '#36393d',
    ivory: '#f6f1e7',
    cream: '#f2ead9',
    beige: '#e8dcc8',
    tan: '#d2b48c',
    khaki: '#c3b091',
    burgundy: '#6d1a2b',
    maroon: '#6d1a2b',
    olive: '#6b6d34',
    camel: '#c19a6b',
    stone: '#ada79a',
    rust: '#b5502b',
    mustard: '#d9a441',
    blush: '#e8c4c4'
  };

  function variantOptionValues(variant) {
    return [variant.option1, variant.option2, variant.option3];
  }

  // Lowercases, trims, and collapses non-breaking spaces so option values
  // like "Medium" / " medium " / "Medium\u00a0" all compare equal.
  function normalize(value) {
    return (value || '').replace(/\u00a0/g, ' ').trim().toLowerCase();
  }

  // Resolves a variant option value (e.g. "Blue") to a CSS colour used for
  // the swatch's left-edge colour indicator.
  function resolveSwatchColor(value) {
    var key = normalize(value);
    if (COLOR_MAP[key]) return COLOR_MAP[key];
    if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', key)) {
      return key;
    }
    return '#cccccc';
  }

  function updateCartCount(cart) {
    if (!cart || typeof cart.item_count !== 'number') return;
    document
      .querySelectorAll('[data-cart-count], .cart-count-bubble span[aria-hidden], .cart-count-bubble, .cart-count')
      .forEach(function (el) {
        el.textContent = cart.item_count;
        if (el.hasAttribute('data-cart-count')) el.setAttribute('data-cart-count', cart.item_count);
      });
  }

  /**
   * Refreshes and opens the Dawn cart drawer after /cart/add.js.
   * Dawn's <cart-drawer>.renderContents() looks up the sections it needs
   * by the literal keys "cart-drawer" / "cart-icon-bubble" (see the
   * request body above), then calls its own .open() internally.
   * Wrapped in try/catch so a rendering issue here never gets reported
   * back to the shopper as a failed add-to-cart — the item is already
   * in their cart by this point regardless.
   */
  function openCartDrawer(addResponse) {
    var cartDrawer = document.querySelector('cart-drawer');

    if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
      try {
        cartDrawer.renderContents(addResponse);
        return; // renderContents already opens the drawer
      } catch (err) {
        console.error('[Custom Product Card] cart-drawer.renderContents() failed, falling back to manual refresh.', err);
      }
    }

    // Fallback for themes without a native <cart-drawer> element/method.
    if (addResponse.sections) {
      ['cart-drawer', 'cart-icon-bubble'].forEach(function (domId) {
        var current = document.getElementById(domId);
        var html = addResponse.sections[domId];
        if (!current || !html) return;
        var temp = document.createElement('div');
        temp.innerHTML = html;
        var replacement = temp.querySelector('#' + domId) || temp.firstElementChild;
        if (replacement) current.replaceWith(replacement);
      });
    }

    var drawerEl = document.querySelector('cart-drawer, .drawer');
    if (drawerEl) {
      drawerEl.classList.remove('is-empty');
      if (typeof drawerEl.open === 'function') {
        drawerEl.open();
      } else {
        drawerEl.classList.add('active', 'is-open');
        drawerEl.removeAttribute('hidden');
      }
    }
  }

  function initCustomProductCard(root) {
    var sectionId = root.getAttribute('data-section-id');

    var overlay = document.getElementById('CustomProductCardPopupOverlay-' + sectionId);
    var closeBtn = document.getElementById('CustomProductCardPopupClose-' + sectionId);
    var imageEl = document.getElementById('CustomProductCardPopupImage-' + sectionId);
    var titleEl = document.getElementById('CustomProductCardPopupTitle-' + sectionId);
    var priceEl = document.getElementById('CustomProductCardPopupPrice-' + sectionId);
    var descEl = document.getElementById('CustomProductCardPopupDescription-' + sectionId);
    var optionsEl = document.getElementById('CustomProductCardPopupOptions-' + sectionId);
    var addBtn = document.getElementById('CustomProductCardPopupAdd-' + sectionId);
    var messageEl = document.getElementById('CustomProductCardPopupMessage-' + sectionId);
    var configEl = document.getElementById('CustomProductCardConfig-' + sectionId);

    if (!overlay || !addBtn) return;

    var config = {};
    try {
      config = JSON.parse(configEl.textContent);
    } catch (err) {
      console.error('[Custom Product Card] Invalid section config JSON.', err);
    }

    if (!config.bundleProductVariantId) {
      console.warn(
        '[Custom Product Card] No auto-add product configured. Set it in the theme customizer under ' +
          'Custom Product Card \u2192 Bundle rule (pick a product, or set a matching product handle).'
      );
    }

    var currentProduct = null;
    var currentSelections = [];
    var currentVariant = null;
    var lastFocusedEl = null;

    function findMatchingVariant() {
      return (
        currentProduct.variants.filter(function (variant) {
          var values = variantOptionValues(variant);
          return currentSelections.every(function (selected, i) {
            return selected === values[i];
          });
        })[0] || null
      );
    }

    function renderOptions() {
      optionsEl.innerHTML = '';

      currentProduct.options.forEach(function (option, idx) {
        var wrap = document.createElement('div');
        wrap.className = 'custom-product-card-popup__option';

        var label = document.createElement('p');
        label.className = 'custom-product-card-popup__option-label';
        label.textContent = option.name;
        wrap.appendChild(label);

        if (/colou?r/i.test(option.name)) {
          // Bordered swatch buttons, each with a colour indicator strip on
          // the left edge; the selected value gets a solid black fill.
          var group = document.createElement('div');
          group.className = 'custom-product-card-popup__swatches';

          option.values.forEach(function (value) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className =
              'custom-product-card-popup__swatch' + (currentSelections[idx] === value ? ' is-selected' : '');
            btn.style.setProperty('--swatch-color', resolveSwatchColor(value));
            btn.textContent = value;
            btn.addEventListener('click', function () {
              currentSelections[idx] = value;
              renderOptions();
              updateVariantState();
            });
            group.appendChild(btn);
          });

          wrap.appendChild(group);
        } else {
          var select = document.createElement('select');
          select.className = 'custom-product-card-popup__select';

          var placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'Choose your ' + option.name.toLowerCase();
          placeholder.disabled = true;
          placeholder.selected = !currentSelections[idx];
          select.appendChild(placeholder);

          option.values.forEach(function (value) {
            var opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            opt.selected = currentSelections[idx] === value;
            select.appendChild(opt);
          });

          select.addEventListener('change', function (event) {
            currentSelections[idx] = event.target.value;
            updateVariantState();
          });

          wrap.appendChild(select);
        }

        optionsEl.appendChild(wrap);
      });
    }

    function updateVariantState() {
      currentVariant = findMatchingVariant();
      priceEl.textContent = currentVariant ? currentVariant.price : currentProduct.price;

      var allSelected = currentSelections.every(Boolean);
      addBtn.disabled = !(allSelected && currentVariant && currentVariant.available);
    }

    function openPopupFor(index, triggerEl) {
      var script = root.querySelector('script[data-custom-product-card-product="' + index + '"]');
      if (!script) return;

      try {
        currentProduct = JSON.parse(script.textContent);
      } catch (err) {
        return;
      }

      var firstAvailable = currentProduct.variants.filter(function (v) { return v.available; })[0] || currentProduct.variants[0];
      currentSelections = currentProduct.options.map(function (option, idx) {
        return firstAvailable ? variantOptionValues(firstAvailable)[idx] : option.values[0];
      });

      imageEl.src = currentProduct.image;
      imageEl.alt = currentProduct.title;
      titleEl.textContent = currentProduct.title;
      descEl.textContent = currentProduct.description;
      messageEl.textContent = '';

      renderOptions();
      updateVariantState();

      lastFocusedEl = triggerEl || document.activeElement;
      overlay.hidden = false;
      document.body.classList.add('custom-product-card-popup-open');
      closeBtn.focus();
    }

    function closePopup() {
      overlay.hidden = true;
      document.body.classList.remove('custom-product-card-popup-open');
      currentProduct = null;
      currentVariant = null;
      if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
    }

    root.querySelectorAll('[data-custom-product-card-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openPopupFor(btn.getAttribute('data-custom-product-card-open'), btn);
      });
    });

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePopup();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !overlay.hidden) closePopup();
    });

    addBtn.addEventListener('click', function () {
      if (!currentVariant) return;

      addBtn.disabled = true;
      messageEl.textContent = 'Adding\u2026';

      var items = [{ id: currentVariant.id, quantity: 1 }];

      // Bundle rule: both trigger option values selected on this variant
      // auto-adds the configured product (e.g. Soft Winter Jacket).
      var trigger1 = normalize(config.bundleTrigger1);
      var trigger2 = normalize(config.bundleTrigger2);
      var selected = currentSelections.filter(Boolean).map(normalize);
      var hasTrigger = function (trigger) {
        return selected.some(function (value) { return value.indexOf(trigger) !== -1; });
      };
      var triggersMatched = trigger1 && trigger2 && hasTrigger(trigger1) && hasTrigger(trigger2);
      var bundleWillAdd = triggersMatched && config.bundleProductVariantId && config.bundleProductAvailable !== false;

      console.log('[Custom Product Card] Selected:', selected, '| Triggers:', trigger1, trigger2, '| Match:', triggersMatched, '| Bundle variant:', config.bundleProductVariantId);

      if (bundleWillAdd) items.push({ id: config.bundleProductVariantId, quantity: 1 });

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: items,
          sections: ['cart-drawer', 'cart-icon-bubble'],
          sections_url: window.location.pathname
        })
      })
        .then(function (response) {
          if (!response.ok) return response.json().then(function (err) { throw err; });
          return response.json();
        })
        .then(function (data) {
          messageEl.textContent = bundleWillAdd ? 'Added to cart, plus a bonus item!' : 'Added to cart!';

          // Remove empty class from cart drawer
          const drawer = document.querySelector(".drawer");

          if (drawer) {
              drawer.classList.remove("is-empty");
          }

          if (data.sections) {
            openCartDrawer(data);
          } else {
            fetch('/cart.js').then(function (r) { return r.json(); }).then(updateCartCount).catch(function () {});
          }

          document.documentElement.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));
          setTimeout(closePopup, 900);
        })
        .catch(function (err) {
          messageEl.textContent = (err && err.description) || 'Sorry, that item could not be added.';
        })
        .finally(function () {
          addBtn.disabled = !(currentVariant && currentVariant.available);
        });
    });
  }

  function init() {
    document.querySelectorAll('.custom-product-card-grid').forEach(initCustomProductCard);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (event) {
    var grid = event.target.querySelector('.custom-product-card-grid');
    if (grid) initCustomProductCard(grid);
  });
})();
