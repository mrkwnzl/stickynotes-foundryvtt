class DrawingWithPreview extends Drawing {
  /**
  * Track the timestamp when the last mouse move event was captured.
  * @type {number}
  */
  #moveTime = 0;

  /* -------------------------------------------- */

  /**
   * The initially active CanvasLayer to re-activate after the workflow is complete.
   * @type {CanvasLayer}
   */
  #initialLayer;

  /* -------------------------------------------- */

  /**
   * Track the bound event handlers so they can be properly canceled later.
   * @type {object}
   */
  #events;

  /* -------------------------------------------- */

  /**
   * A factory method to create an AbilityTemplate instance using provided data from an Item5e instance
   * @param {Item5e} item               The Item object for which to construct the template
   * @returns {AbilityTemplate|null}    The template object, or null if the item does not produce a template
   */
  static fromData(data) {

    // Prepare template data
    const templateData = data;

    const cls = CONFIG.Drawing.documentClass;
    const template = new cls(templateData, {parent: canvas.scene});
    const object = new this(template);
    return object;
  }

  /* -------------------------------------------- */

  /**
   * Creates a preview of the spell template.
   * @returns {Promise}  A promise that resolves with the final measured template if created.
   */
  async drawPreview() {
    const initialLayer = canvas.activeLayer;

    // Draw the template and switch to the template layer
    this.draw();
    this.layer.activate();
    this.layer.preview.addChild(this);

    // Minimize windows
    game.user.stickynotes = {};
    game.user.stickynotes.openWindows = Object.values(ui.windows).filter((x) => !!x.minimize && !x._minimized);
    for (let window of game.user.stickynotes.openWindows) {
      window.minimize();
    }

    // Activate interactivity
    return this.activatePreviewListeners(initialLayer);
  }

  /* -------------------------------------------- */

  /**
   * Activate listeners for the template preview
   * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
   * @returns {Promise}                 A promise that resolves with the final measured template if created.
   */
  activatePreviewListeners(initialLayer) {
    return new Promise((resolve, reject) => {
      this.#initialLayer = initialLayer;
      this.#events = {
        cancel: this._onCancelPlacement.bind(this),
        confirm: this._onConfirmPlacement.bind(this),
        move: this._onMovePlacement.bind(this),
        resolve,
        reject
      };

      // Activate listeners
      canvas.stage.on("mousemove", this.#events.move);
      canvas.stage.on("mousedown", this.#events.confirm);
    });
  }

  /* -------------------------------------------- */

  /**
   * Shared code for when template placement ends by being confirmed or canceled.
   * @param {Event} event  Triggering event that ended the placement.
   */
  async _finishPlacement(event) {
    this.layer._onDragLeftCancel(event);
    canvas.stage.off("mousemove", this.#events.move);
    canvas.stage.off("mousedown", this.#events.confirm);
    canvas.app.view.oncontextmenu = null;
    canvas.app.view.onwheel = null;
    for (let window of game.user.stickynotes.openWindows) {
      window.maximize();
    }
    game.user.stickynotes.openWindows = [];
    if (!game.settings.get("stickynotes", "enableDrawingTools")) this.#initialLayer.activate();
  }

  /* -------------------------------------------- */

  /**
   * Move the template preview when the mouse moves.
   * @param {Event} event  Triggering mouse event.
   */
  _onMovePlacement(event) {
    event.stopPropagation();
    const now = Date.now(); // Apply a 20ms throttle
    if (now - this.#moveTime <= 20) return;
    const center = event.data.getLocalPosition(this.layer);
    this.document.updateSource({x: center.x, y: center.y});
    this.refresh();
    this.#moveTime = now;
  }

  /* -------------------------------------------- */

  /**
   * Confirm placement when the left mouse button is clicked.
   * @param {Event} event  Triggering mouse event.
   */
  async _onConfirmPlacement(event) {
    await this._finishPlacement(event);
    const interval = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ? 0 : 2;
    const destination = canvas.grid.getSnappedPosition(this.document.x, this.document.y, interval);
    this.document.updateSource(destination);
    this.#events.resolve(canvas.scene.createEmbeddedDocuments("Drawing", [this.document.toObject()]));
  }

  /* -------------------------------------------- */

  /**
   * Cancel placement when the right mouse button is clicked.
   * @param {Event} event  Triggering mouse event.
   */
  async _onCancelPlacement(event) {
    await this._finishPlacement(event);
    this.#events.reject();
  }
}

Hooks.on("init", () => {
  // Register keybindings
  const {SHIFT, CONTROL, ALT} = KeyboardManager.MODIFIER_KEYS;

  game.keybindings.register("stickynotes", "createStickyNote", {
    name: game.i18n.localize("STICKYNOTES.CreateStickyNote"),
    editable: [
      {
        key: "KeyN",
        modifiers: [ALT]
      }
    ],
    onDown: async () => {
      newStickyNote(await createNoteData());
    },
    repeat: false
  });

  game.keybindings.register("stickynotes", "editStickyNote", {
    name: game.i18n.localize("STICKYNOTES.EditStickyNoteControls"),
    editable: [
      {
        key: "KeyE",
        modifiers: [ALT]
      }
    ],
    onDown: async () => {
      main(false);
    },
    repeat: false
  });

  // Register settings
  game.settings.register("stickynotes", "enableDrawingTools", {
    name: game.i18n.localize("STICKYNOTES.EnableDrawingTools"),
    hint: game.i18n.localize("STICKYNOTES.EnableDrawingToolsHint"),
    scope: "world",
    type: Boolean,
    default: false,
    config: true
  });
});

Hooks.on("getSceneControlButtons", function (hudButtons) {
  let drawingControls = hudButtons.find(val => {
    return val.name == "drawings";
  });
  if (drawingControls) {
    drawingControls.tools.push({
      name: "stickyNote",
      title: game.i18n.localize("STICKYNOTES.Title"),
      icon: "fa-solid fa-note-sticky",
      onClick: () => {
        main(true);
      },
      button: true
    });
  }
});

async function createNoteData(data) {
  // RNGs
  let rotationRNG = Math.floor(Math.random() * 11) - 5;
  let textureRNG = Math.floor(Math.random() * 5) + 1;

  // Create object
  data = Object.assign({
    // Size and rotation
    shape: {
      width: 512,
      height: 512
    },
    rotation: rotationRNG,

    // Border
    strokeOpacity: 1,
    strokeColor: "#000000",
    strokeWidth: 1,

    // Fill color
    fillAlpha: 1,
    fillColorYellow: "#fff0a3",
    fillColorRed: "#f08080",
    fillColorGreen: "#a4f0a4",
    fillColorBlue: "#a4a4f0",
    fillColor: "#fff0a3",
    fillType: 2,
    texture: `modules/stickynotes/img/paper-square-0${textureRNG}.webp`,

    // Text
    textOpacity: 1,
    textColor: "#000000",
    textSize: 48,
    flags: {
      "stickynotes": {
        "isStickyNote": true
      },
      "advanced-drawing-tools": {
        "textStyle": {
          "align": "center",
          "dropShadow": false,
          "strokeThickness": 0
        }
      }
    }
  }, data);

  return data;
}

async function main(create) {
  // Get data and note
  let data = await createNoteData();
  let note = canvas?.drawings?.controlled[0]?.document;

  // Check if note is selected
  if (note && note?.flags?.stickynotes?.isStickyNote) {
    editNote(note, data);
  } else if (note && !note?.flags?.stickynotes?.isStickyNote && note.text) {
    convertToNote(note, data);
  } else if (create) {
    newStickyNote(data);
  }
}

async function newStickyNote(data) {
  let d = new Dialog({
    title: game.i18n.localize("STICKYNOTES.CreateStickyNote"),
    content: `<input class="stickynotes text-input" type="text" autofocus />`,
    buttons: {
      createYellow: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorYellow};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Yellow"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorYellow;
          const drawing = DrawingWithPreview.fromData(data);
          await drawing.drawPreview();
        }
      },
      createRed: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorRed};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Red"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorRed;
          const drawing = DrawingWithPreview.fromData(data);
          await drawing.drawPreview();
        }
      },
      createGreen: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorGreen};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Green"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorGreen;
          const drawing = DrawingWithPreview.fromData(data);
          await drawing.drawPreview();
        }
      },
      createBlue: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorBlue};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Blue"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorBlue;
          const drawing = DrawingWithPreview.fromData(data);
          await drawing.drawPreview();
        }
      }
    },
    default: "createYellow",
    close: () => {}
  });
  d.render(true);
}

async function editNote(note, data) {
  let defaultButton = "updateYellow";
  if (note.fillColor == data.fillColorYellow) {
    defaultButton = "updateYellow";
  } else if (note.fillColor == data.fillColorRed) {
    defaultButton = "updateRed";
  } else if (note.fillColor == data.fillColorGreen) {
    defaultButton = "updateGreen";
  } else if (note.fillColor == data.fillColorBlue) {
    defaultButton = "updateBlue";
  }

  let d = new Dialog({
    title: game.i18n.localize("STICKYNOTES.EditStickyNote"),
    content: `<input class="stickynotes text-input" type="text" value="${note.text}" autofocus />`,
    buttons: {
      updateYellow: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorYellow};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Yellow"),
        callback: async (html) => {
          await note.update({
            "text": html.find('input').val(),
            "fillColor": data.fillColorYellow
          });
          canvas.drawings.draw();
        }
      },
      updateRed: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorRed};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Red"),
        callback: async (html) => {
          await note.update({
            "text": html.find('input').val(),
            "fillColor": data.fillColorRed
          });
          canvas.drawings.draw();
        }
      },
      updateGreen: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorGreen};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Green"),
        callback: async (html) => {
          await note.update({
            "text": html.find('input').val(),
            "fillColor": data.fillColorGreen
          });
          canvas.drawings.draw();
        }
      },
      updateBlue: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorBlue};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Blue"),
        callback: async (html) => {
          await note.update({
            "text": html.find('input').val(),
            "fillColor": data.fillColorBlue
          });
          canvas.drawings.draw();
        }
      },
    },
    default: defaultButton,
    close: () => {}
  });
  d.render(true);
}

async function convertToNote(note, data) {
  let defaultButton = "updateYellow";

  if (note.fillColor == data.fillColorYellow) {
    defaultButton = "updateYellow";
  } else if (note.fillColor == data.fillColorRed) {
    defaultButton = "updateRed";
  } else if (note.fillColor == data.fillColorGreen) {
    defaultButton = "updateGreen";
    data.fillColor = data.fillColorGreen;
  } else if (note.fillColor == data.fillColorBlue) {
    defaultButton = "updateBlue";
    data.fillColor = data.fillColorBlue;
  }

  let d = new Dialog({
    title: game.i18n.localize("STICKYNOTES.ConvertToStickyNote"),
    content: `<input class="stickynotes text-input" type="text" value="${note.text}" autofocus />`,
    buttons: {
      updateYellow: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorYellow};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Yellow"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorYellow;
          await note.update(data);
          canvas.drawings.draw();
        }
      },
      updateRed: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorRed};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Red"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorRed;
          await note.update(data);
          canvas.drawings.draw();
        }
      },
      updateGreen: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorGreen};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Green"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorGreen;
          await note.update(data);
          canvas.drawings.draw();
        }
      },
      updateBlue: {
        icon: `<i class="stickynotes fa-solid fa-note-sticky" style="color: ${data.fillColorBlue};"></i>`,
        label: game.i18n.localize("STICKYNOTES.Blue"),
        callback: async (html) => {
          data.text = html.find('input').val();
          data.fillColor = data.fillColorBlue;
          await note.update(data);
          canvas.drawings.draw();
        }
      },
    },
    default: defaultButton,
    close: () => {}
  });
  d.render(true);
}