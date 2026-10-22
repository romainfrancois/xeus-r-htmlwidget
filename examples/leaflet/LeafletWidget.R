LeafletView <- R6::R6Class(
  "LeafletView",
  inherit = WidgetView,
  public = list(
    set_view = function(lat, lng, zoom = NULL, options = NULL) {
      private$call_method("setView", c(lat, lng), zoom, options)
    },

    fly_to = function(lat, lng, zoom = NULL, options = NULL) {
      private$call_method("flyTo", c(lat, lng), zoom, options)
    },

    fit_bounds = function(south, west, north, east, options = NULL) {
      private$call_method(
        "fitBounds",
        list(c(south, west), c(north, east)),
        options
      )
    },

    zoom_in = function(delta = 1, options = NULL) {
      private$call_method("zoomIn", delta, options)
    },

    zoom_out = function(delta = 1, options = NULL) {
      private$call_method("zoomOut", delta, options)
    }
  ),

  private = list(
    call_method = function(method, ...) {
      args <- list(...)

      # Omit trailing NULL arguments
      while (length(args) && is.null(args[[length(args)]])) {
        args <- args[-length(args)]
      }

      self$send_custom_message("leaflet-calls", list(
        id = self$id,
        calls = list(list(
          method = method,
          args = args,
          evals = list()
        ))
      ))
    }
  )
)

LeafletWidget <- R6::R6Class(
  "LeafletWidget",
  inherit = Widget,
  public = list(
    view_class = LeafletView,

    initialize = function(widget) {
        widget <- htmlwidgets::onRender(widget, "
            function(el, x) {
                LeafletWidget.methods.zoomIn = function(delta, options) {
                    this.zoomIn(delta, options);
                };

                LeafletWidget.methods.zoomOut = function(delta, options) {
                    this.zoomOut(delta, options);
                };
            }
        ")
        super$initialize(widget)
    }, 

    set_view = function(lat, lng, zoom = NULL, options = NULL) {
      self$broadcast("set_view", lat, lng, zoom, options)
    },

    fly_to = function(lat, lng, zoom = NULL, options = NULL) {
      self$broadcast("fly_to", lat, lng, zoom, options)
    },

    fit_bounds = function(south, west, north, east, options = NULL) {
      self$broadcast("fit_bounds", south, west, north, east, options)
    },

    zoom_in = function(delta = 1, options = NULL) {
      self$broadcast("zoom_in", delta, options)
    },

    zoom_out = function(delta = 1, options = NULL) {
      self$broadcast("zoom_out", delta, options)
    }
  )
)
