HTMLWidgets.widget({
    name: "mapsearch",
    type: "output",

    factory: function(el) {
      const input = document.createElement("input");

      input.type = "text";
      input.style.width = "100%";
      input.style.boxSizing = "border-box";
      input.style.padding = "8px";
      input.style.fontSize = "14px";

      el.appendChild(input);

      input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          Shiny.setInputValue(
            el.id + "_address",
            input.value,
            { priority: "event" }
          );
        }
      });

      return {
        renderValue: function(x) {
          input.placeholder = "Search for address ...";
        },

        resize: function(width, height) {}
      };
    }
  });