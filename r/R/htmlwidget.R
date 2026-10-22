env_widgets <- new.env()

#' @export
WidgetView <- R6::R6Class("WidgetView", 
  public = list(
    widget = NULL, 
    comm = NULL, 
    id = NULL, 

    initialize = function(widget) {
      self$widget <- widget
      self$comm <- CommManager$new_comm("xeus-r.htmlwidget")
      self$comm$on_message(function(message) {
        private$handle_message(message$content$data)
      })
      self$comm$on_close(function(...) {
        private$cleanup()
      })
      private$closed <- FALSE
      self$comm$open()
    }, 

    close = function() {
      if (private$closed) {
        return(invisible(self))
      }

      private$closed <- TRUE
      on.exit(private$cleanup(), add = TRUE)
      self$comm$close()
      
      invisible(self)
    }, 

    send_custom_message = function(type, message) {
      if (private$closed) {
        stop("Cannot send a message to a closed WidgetView")
      }

      self$comm$send(list(
        method = "custom",
        type = type,
        message = message
      ))

      invisible(self)
    }, 

    description = function() {
      glue::glue("<View comm_id={self$comm$id} id={self$id}>")
    },

    is_closed = function() {
      isTRUE(private$closed)
    }
  ), 

  private = list(
    closed = logical(), 

    send_init = function() {
      rendered <- htmltools::renderTags(
        htmltools::as.tags(self$widget$htmlwidget)
      )
      self$comm$send(
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

      self$comm$send(data = list(
        method = "runtime",
        content = jsonlite::base64_enc(content)
      ))
    }, 

    send_dependencies = function() {
      dependencies <- htmltools::resolveDependencies(self$widget$htmlwidget$dependencies)
      
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

      self$comm$send(data = list(
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
          self$id <- data$id
        }, 
        input = {
          self$widget$handle_input(
            data$name, data$value, self
          )
        }, 
        init = private$send_init(), 
        runtime = private$send_runtime(), 
        dependencies = private$send_dependencies()
      )
    }, 

    cleanup = function() {
      if (private$closed && is.null(self$widget)) {
        return(invisible(NULL))
      }

      private$closed <- TRUE

      widget <- self$widget
      self$widget <- NULL

      if (!is.null(widget)) {
        widget$remove_view(self$comm$id)
      }

      invisible(NULL)
    }

  )
)


#' @import hera
#' @export
Widget <- R6::R6Class(
  "Widget",

  active = list(
    views = function(value) {
      if (!missing(value)) {
        stop("views is read-only")
      }
      as.list(private$views_)
    }
  ),

  private = list(
    views_ = NULL,
    input_callbacks = NULL
  ),

  public = list(
    view_class = WidgetView,

    htmlwidget = NULL, 
    
    initialize = function(htmlwidget) {
      self$htmlwidget <- htmlwidget
      private$views_ <- new.env(parent = emptyenv())
      private$input_callbacks <- new.env(parent = emptyenv())
    },

    new_view = function() {
      view <- self$view_class$$new(self)
      private$views_[[view$comm$id]] <- view
      view
    }, 

    description = function() {
      views <- as.list(private$views_)
      out <- glue::glue("<Widget with {length(views)} views>")
      for (i in seq_along(views)) {
        out <- c(out, glue::glue("  {views[[i]]$description()}"))
      }

      out
    },

    print = function(...) {
      writeLines(self$description())
      invisible(self)
    },

    remove_view = function(comm_id) {
      if (exists(comm_id, envir = private$views_, inherits = FALSE)) {
        rm(list = comm_id, envir = private$views_)
      }

      invisible(self)
    }, 

    on_input = function(name, callback = NULL) {
      if (is.null(name)) {
        private$input_callbacks <- new.env(parent = emptyenv())
      } else {
        private$input_callbacks[[name]] <- callback
      }

      invisible(self)
    },

    handle_input = function(name, value, view) {
      prefix <- paste0(view$id, "_")

      if (!startsWith(name, prefix)) {
        return(invisible(NULL))
      }

      input_name <- substring(name, nchar(prefix) + 1L)
      callback <- private$input_callbacks[[input_name]]

      if (is.function(callback)) {
        callback(value)
      }

      invisible(self)
    },

    close = function() {
      ids <- ls(private$views_)

      for (id in ids) {
        private$views_[[id]]$close()
      }
      private$views_ <- new.env(parent = emptyenv())
      private$input_callbacks <- new.env(parent = emptyenv())

      invisible(self)
    },

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

    send_custom_message = function(type, message) {
      fun <- if (is.function(message)) {
        function(view) {
          view$send_custom_message(type, message(view))
        }
      } else {
        function(view) {
          view$send_custom_message(type, message)
        }
      }
      self$broadcast(fun)
    }
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