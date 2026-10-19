mapsearch <- function() {
  dependency <- htmltools::htmlDependency(
    name = "mapsearch",
    version = "0.1.0",
    src = c(file = "."),
    script = "mapsearch.js"
  )

  htmlwidgets::createWidget(
    name = "mapsearch",
    x = list(),
    dependencies = list(dependency),
    width = NULL,
    height = 50
  )
}
