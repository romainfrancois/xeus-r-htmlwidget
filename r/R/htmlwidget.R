#' @import hera
#' @importFrom glue glue
NULL

#' html widget view
#'
#' @export
WidgetView <- R6::R6Class("WidgetView",
  public = list(

    #' @description create a new view for the widget
    #'
    #' @param widget a Widget instance
    initialize = function(widget) {
      private$widget_ <- widget
      private$comm_ <- CommManager$new_comm("xeus-r.htmlwidget")
      private$comm_$on_message(function(message) {
        private$handle_message(message$content$data)
      })
      private$comm_$on_close(function(...) {
        private$cleanup()
      })
      private$closed_ <- FALSE
      private$comm_$open()
    },

    #' @description Explicitely close the view
    close = function() {
      if (private$closed_) {
        return(invisible(self))
      }

      private$closed_ <- TRUE
      on.exit(private$cleanup(), add = TRUE)
      private$comm_$close()

      invisible(self)
    },

    #' @description send a custom message to the front-end display
    #'
    #' @param type message type
    #' @param message message content
    send = function(type, message) {
      if (isTRUE(private$closed_)) {
        stop("Cannot send a message to a closed <WidgetView>")
      }

      private$comm_$send(list(
        method = "custom",
        type = type,
        message = message
      ))

      invisible(self)
    },

    #' @description short description for this view
    description = function() {
      glue::glue("<View comm_id={self$comm$id} id={self$id}>")
    },

    #' @description is this view closed ?
    is_closed = function() {
      isTRUE(private$closed_)
    }
  ),

  active = list(

    #' @field id read-only dom id for this widget view
    id = function(value) {
      if (!missing(value)) stop("<WidgetView>$id is ready only")
      private$id_
    },

    #' @field widget read-only Widget instance
    widget = function(value) {
      if (!missing(value)) stop("<WidgetView>$widget is ready only")
      private$widget_
    },

    #' @field comm read-only comm for this view
    comm = function(value) {
      if (!missing(value)) stop("<WidgetView>$comm is ready only")
      private$comm_
    }

  ),

  private = list(
    comm_ = NULL,
    id_ = NULL,

    closed = logical(),

    send_init = function() {
      rendered <- htmltools::renderTags(
        htmltools::as.tags(private$widget_$htmlwidget)
      )
      private$comm_$send(
        data = list(
          method = "init",
          payload = rendered$html
        )
      )
    },

    send_runtime = function() {
      path <- system.file("www", "htmlwidgets.js", package = "htmlwidgets")

      content <- readBin(
        path,
        what = "raw",
        n = file.info(path)$size
      )

      private$comm_$send(data = list(
        method = "runtime",
        content = jsonlite::base64_enc(content)
      ))
    },

    send_dependencies = function() {
      dependencies <- htmltools::resolveDependencies(private$widget_$htmlwidget$dependencies)

      scripts <- list()
      stylesheets <- list()

      for (dep in dependencies) {
        root <- dep$src$file

        for (path in dep$script) {
          resource <- read_resource(dep$name, dep$version, root, path)
          scripts <- append(scripts, list(resource))
        }

        for (path in dep$stylesheet) {
          resource <- read_resource(dep$name, dep$version, root, path)
          stylesheets <- append(stylesheets, list(resource))
        }
      }

      private$comm_$send(data = list(
        method      = "dependencies",
        scripts     = unname(scripts),
        stylesheets = unname(stylesheets)
      ))
    },

    handle_message = function(data) {
      if (private$closed) {
        return(invisible(NULL))
      }

      switch(data$method,
        initialized = {
          private$id_ <- data$id
        },
        input = {
          private$widget_$handle_input(
            data$name, data$value, self
          )
        },
        init = private$send_init(),
        runtime = private$send_runtime(),
        dependencies = private$send_dependencies()
      )
    },

    cleanup = function() {
      if (private$closed_ && is.null(private$widget_)) {
        return(invisible(NULL))
      }

      private$closed_ <- TRUE

      widget <- private$widget_
      private$widget_ <- NULL

      if (!is.null(widget)) {
        widget$remove_view(self)
      }

      invisible(NULL)
    }

  )
)

#' Wrapper for html widget
#'
#' Wrapper for html widget, typically made from [htmlwidgets::createWidget()]
#'
#' @export
Widget <- R6::R6Class(
  "Widget",

  active = list(

    #' @field views list of known views for this widget
    views = function(value) {
      if (!missing(value)) stop("<Widget>$views is read-only")
      as.list(private$views_)
    },

    #' @field htmlwidget underlying html widget created from [htmlwidgets::createWidget()]
    htmlwidget = function(value) {
      if (!missing(value)) stop("<Widget>$htmlwidget is read-only")
      private$htmlwidget_
    }

  ),

  public = list(

    #' @field view_class View class, used to create new view for this widget
    view_class = WidgetView,

    #' @description create a new Widget wrapper
    #'
    #' @param htmlwidget see [htmlwidgets::createWidget()]
    initialize = function(htmlwidget) {
      private$htmlwidget_ <- htmlwidget
      private$views_ <- new.env(parent = emptyenv())
      private$input_callbacks_ <- new.env(parent = emptyenv())
    },

    #' @description create a new view for the Widget
    new_view = function() {
      view <- self$view_class$new(self)
      private$views_[[view$comm$id]] <- view
      view
    },

    #' @description remove view
    #'
    #' @param view view to be removed
    remove_view = function(view) {
      if (!inherits(view, self$view_class)) {
        stop("view must be a compatible WidgetView")
      }
      comm_id <- view$comm$id
      if (exists(comm_id, envir = private$views_, inherits = FALSE)) {
        rm(list = comm_id, envir = private$views_)
      }

      invisible(self)
    },

    #' @description give a short description for the widget and its views
    description = function() {
      views <- as.list(private$views_)
      out <- glue::glue("<Widget with {length(views)} views>")
      for (i in seq_along(views)) {
        out <- c(out, glue::glue("  {views[[i]]$description()}"))
      }

      out
    },

    #' @description register a callback
    #'
    #' @param name of the input
    #' @param callback callback function
    on = function(name, callback = NULL) {
      if (is.null(name)) {
        private$input_callbacks_ <- new.env(parent = emptyenv())
      } else {
        private$input_callbacks_[[name]] <- callback
      }

      invisible(self)
    },

    #' @description handle input from front end
    #'
    #' @param name name of the input
    #' @param value value of the input
    #' @param view WidgetView the input originated from
    #'
    #' @details if a callback is registered for this input, it's called
    handle_input = function(name, value, view) {
      prefix <- paste0(view$id, "_")

      if (!startsWith(name, prefix)) {
        return(invisible(NULL))
      }

      input_name <- substring(name, nchar(prefix) + 1L)
      callback <- private$input_callbacks_[[input_name]]

      if (is.function(callback)) {
        callback(value)
      }

      invisible(self)
    },

    #' @description close the widget and its views
    close = function() {
      ids <- ls(private$views_)

      for (id in ids) {
        private$views_[[id]]$close()
      }
      private$views_ <- new.env(parent = emptyenv())
      private$input_callbacks_ <- new.env(parent = emptyenv())

      invisible(self)
    },

    #' @description broadcast a method call to all views
    #'
    #' @param method name of the method
    #' @param ... additional parameters for the method
    #'
    #' @details if method is a function, it is called with
    #' view as the first parameter, followed by ...
    #'
    #' if method is a string, the corresponding method is called, without
    #' passing view
    broadcast = function(method, ...) {
      for (view in as.list(private$views_)) {
        if (view$is_closed() || is.null(view$id)) {
          next
        }

        if (is.function(method)) {
          method(view, ...)
        } else {
          view[[method]](...)
        }
      }

      invisible(self)
    },

    #' @description send a message to all views
    #'
    #' @param type message type
    #' @param message Either a list, sent directly to all views, or a function
    #'   that is called with view as its parameter. This allows view specific
    #'   tuning of the message.
    send = function(type, message) {
      fun <- if (is.function(message)) {
        function(view) {
          view$send(type, message(view))
        }
      } else {
        function(view) {
          view$send(type, message)
        }
      }
      self$broadcast(fun)
    }
  ),

  private = list(
    views_ = NULL,
    input_callbacks_ = NULL,
    htmlwidget_ = NULL
  )
)

#' @export
mime_types.Widget <- function(x) {
  c("text/plain", "application/vnd.jupyter.r-htmlwidget+json")
}

#' @export
mime_types.WidgetView <- function(x) {
  c("text/plain", "application/vnd.jupyter.r-htmlwidget+json")
}

#' @export
mime_bundle.Widget <- function(x, mimetypes = mime_types(x), ...) {

  mime <- "application/vnd.jupyter.r-htmlwidget+json"
  if (!(mime %in% mimetypes)) {
    return(list(
      data = list(
        "text/plain" = "HTML widget requires support for application/vnd.jupyter.r-htmlwidget+json"
      ),
      metadata = list()
    ))
  }

  view <- x$new_view()
  mime_bundle(view, mimetypes = mimetypes, ...)
}

#' @export
mime_bundle.WidgetView <- function(x, mimetypes = mime_types(x), ...) {
  if (x$is_closed()) {
    stop("Cannot display a closed WidgetView")
  }

  data <- list()
  metadata <- list()

  if ("text/plain" %in% mimetypes) {
    data[["text/plain"]] <- "HTML widget requires support for application/vnd.jupyter.r-htmlwidget+json"
  }

  mime <- "application/vnd.jupyter.r-htmlwidget+json"
  if (mime %in% mimetypes) {
    data[[mime]] <- list(comm_id = x$comm$id)
  }

  list(data = data, metadata = metadata)
}

read_resource <- function(name, version, src, path) {
  file <- file.path(src, path)
  list(
    name    = name,
    version = version,
    path    = path,
    content = jsonlite::base64_enc(
      readBin(file, "raw", n = file.info(file)$size)
    )
  )
}
