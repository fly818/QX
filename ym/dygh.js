let html = $response.body;

html =
  html.replace(/stock":"0/g, `stock":"5`);


$done({ body: html});
