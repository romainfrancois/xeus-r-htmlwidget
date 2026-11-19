library(httr2)
library(purrr)
library(tibble)

get_earthquakes <- function(bounds) {
  req <- request(
    "https://earthquake.usgs.gov/fdsnws/event/1/query"
  ) |>
    req_url_query(
      format = "geojson",
      minlatitude  = bounds$south,
      maxlatitude  = bounds$north,
      minlongitude = bounds$west,
      maxlongitude = bounds$east,
      starttime = as.character(Sys.Date() - 30),
      minmagnitude = 2.5,
      orderby = "time",
      limit = 500
    )

  data <- resp_body_json(req_perform(req))
  
  map_dfr(data$features, function(feature) {
    p <- feature$properties
    coords <- unlist(feature$geometry$coordinates)
  
    tibble(
      id = feature$id,
      longitude = coords[1],
      latitude = coords[2],
      magnitude = p$mag,
      place = p$place,
      time = as.POSIXct(
        p$time / 1000,
        origin = "1970-01-01",
        tz = "UTC"
      )
    )
  })
}

EarthquakeTableView <- R6::R6Class(
  "EarthquakeTableView",
  inherit = WidgetView,

  public = list(
    replace_data = function(data) {
      rows <- lapply(seq_len(nrow(data)), function(i) {
        unname(as.list(data[i, , drop = FALSE]))
      })

      self$send(
        "datatable-calls",
        list(
          id = self$id,
          call = list(
            method = "replaceData",
            args = list(rows)
          )
        )
      )

      invisible(self)
    }
  )
)

EarthquakeTableWidget <- R6::R6Class(
  "EarthquakeTableWidget",
  inherit = Widget,

  public = list(
    data = NULL,
    view_class = EarthquakeTableView,

    initialize = function() {
      self$data <- data.frame(
        id = character(),
        longitude = numeric(),
        latitude = numeric(),
        magnitude = numeric(),
        place = character(),
        time = as.POSIXct(character(), tz = "UTC")
      )
      
      withr::local_options(DT.datatable.shiny = TRUE)
      widget <- DT::datatable(
        self$data,
        rownames = FALSE,
        selection = "multiple",
        options = list(
          pageLength = 10,
          scrollX = TRUE
        )
      ) |>
        htmlwidgets::onRender("
          function(el, x) {
            const table = $(el).data('datatable');

            table.shinyMethods.replaceData = function(rows) {
              this.clear();
              this.rows.add(rows);
              this.draw();
            };
          }
        ")

      super$initialize(widget)
    },

    replace_data = function(data) {
      self$data <- data
      self$broadcast("replace_data", data)
      invisible(self)
    }
  )
)
