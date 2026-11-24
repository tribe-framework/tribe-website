<?php
    $meta_title       = "Junction";
    $meta_description = "Build your vision";
    $meta_image_url   = "/assets/img/cover.png";
    $twitter_handle   = "";
?>

<title><?php echo $meta_title ?></title>
<meta name="description" content="<?php echo $meta_description ?>">

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@<?php echo $twitter_handle ?>" />
<meta name="twitter:creator" content="@<?php echo $twitter_handle ?>" />

<meta property="og:title" content="<?php echo $meta_title ?>">
<meta property="og:description" content="<?php echo $meta_description ?>">

<meta property="og:image" content="<?php echo $meta_image_url ?>">
<meta name="junction/config/environment" content="%7B%22modulePrefix%22%3A%22junction%22%2C%22environment%22%3A%22production%22%2C%22rootURL%22%3A%22%2F%22%2C%22locationType%22%3A%22history%22%2C%22EmberENV%22%3A%7B%22EXTEND_PROTOTYPES%22%3Afalse%2C%22FEATURES%22%3A%7B%7D%2C%22_APPLICATION_TEMPLATE_WRAPPER%22%3Afalse%2C%22_DEFAULT_ASYNC_OBSERVERS%22%3Atrue%2C%22_JQUERY_INTEGRATION%22%3Afalse%2C%22_NO_IMPLICIT_ROUTE_MODEL%22%3Atrue%2C%22_TEMPLATE_ONLY_GLIMMER_COMPONENTS%22%3Atrue%7D%2C%22APP%22%3A%7B%7D%2C%22JUNCTION_SLUG%22%3A%22<?php echo urlencode($_ENV['JUNCTION_SLUG']); ?>%22%2C%22JUNCTION_URL%22%3A%22<?php echo urlencode($_ENV['JUNCTION_URL']); ?>%22%2C%22PLAUSIBLE_EMBED_URL%22%3A%22<?php echo urlencode($_ENV['PLAUSIBLE_EMBED_URL']); ?>%22%2C%22HIDE_TRIBE_ATTRIBUTION%22%3A%22<?php echo urlencode($_ENV['HIDE_TRIBE_ATTRIBUTION']); ?>%22%2C%22TribeENV%22%3A%7B%22API_URL%22%3A%22<?php echo urlencode($_ENV['TRIBE_API_URL']); ?>%22%7D%7D" />