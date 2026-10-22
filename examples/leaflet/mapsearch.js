HTMLWidgets.widget({
    name: "mapsearch",
    type: "output",

    factory: function(el) {
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.style.gap = "4px";

      const input = document.createElement("input");

      input.type = "text";
      input.style.width = "100%";
      input.style.boxSizing = "border-box";
      input.style.padding = "8px";
      input.style.fontSize = "14px";

      const zoomIn = document.createElement("button");
      zoomIn.textContent = "+";
      
      const zoomOut = document.createElement("button");
      zoomOut.textContent = "−";
      
      let zoomInClicks = 0;
      let zoomOutClicks = 0;
      
      zoomIn.addEventListener("click", () => {
        Shiny.setInputValue(el.id + "_zoom_in", ++zoomInClicks);
      });
      
      zoomOut.addEventListener("click", () => {
        Shiny.setInputValue(el.id + "_zoom_out", ++zoomOutClicks);
      });
      
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          Shiny.setInputValue(
            el.id + "_address",
            input.value,
            { priority: "event" }
          );
        }
      });

      input.style.flex = "1";
      input.style.minWidth = "0";

      container.append(input, zoomIn, zoomOut);
      el.appendChild(container);

      return {
        renderValue: function(x) {
          input.placeholder = "Search for address ...";
        },

        resize: function(width, height) {}
      };
    }
  });