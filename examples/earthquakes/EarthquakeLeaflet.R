
LeafletWidgetView <- R6::R6Class(
  "LeafletWidgetView",
  inherit = WidgetView,
  public = list(

    call_method = function(method, ...) {
      args <- list(...)

      self$send("leaflet-calls", list(
        id = private$id_,
        calls = list(list(
          method = method,
          args = args,
          evals = list()
        ))
      ))
    }
  )
)

EarthquakeLeafletWidgetView <- R6::R6Class(
  "EarthquakeLeafletWidgetView",
  inherit = LeafletWidgetView,
  public = list(

    set_earthquake_markers = function(data) {
        self$clear_earthquake_markers()
        if (nrow(data) > 0) {

            n <- nrow(data)

            self$call_method(
                "addCircleMarkers", 
                data$latitude, 
                data$longitude, 
                rep(20, nrow(data)), 
                data$id, 
                rep("group-earthquakes", nrow(data)), 
                list(
                    color = rep("red", n),
                    fillColor = rep("red", n),
                    fillOpacity = rep(0.8, n),
                    weight = rep(2, n)
                ), 
                NULL, 
                NULL, 
                data$place, # popup
                NULL, # popupOptions
                NULL, # label
                NULL, # labelOptions
                NULL  # crosstalkOptions
            )
        }
    }, 

    clear_earthquake_markers = function() {
        self$call_method("clearGroup", "group-earthquakes")
    }
  )
)

EarthquakeLeafletWidget <- R6::R6Class(
  "EarthquakeLeafletWidget",
  inherit = Widget,
  public = list(
    view_class = EarthquakeLeafletWidgetView,

    initialize = function() {
        widget <- leaflet() |>
          addTiles() |>
          setView(lng = -119.5, lat = 36.5, zoom = 8)
        super$initialize(widget)
    }, 

    set_earthquake_markers = function(data) {
      self$broadcast("set_earthquake_markers", data)
    }, 

    clear_earthquake_markers = function(data) {
        self$broadcast("clear_earthquake_markers")
    }
  )
)
