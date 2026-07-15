(function () {
  "use strict";

  var summary = document.getElementById("api-surface-summary");

  if (!summary) {
    return;
  }

  var values = summary.querySelectorAll("strong");

  if (values.length < 3) {
    return;
  }

  fetch("https://api.atlas-systems.uk/v1/topology", {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      return response.json();
    })
    .then(function (topology) {
      values[2].textContent = String(
        topology.repository_count ||
          new Set(
            (topology.components || []).map(function (component) {
              return component.repo_name;
            }),
          ).size,
      );
    })
    .catch(function () {
      values[2].textContent = "—";
    });
})();
