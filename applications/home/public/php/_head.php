<?php
//SEO code and Meta tags

$core = new \Tribe\Core;
$uploads = new \Tribe\Uploads;

//Website's title, description, twitter handle and cover image link
$meta_title = "";
$meta_description = "";
$meta_image_url = "";
$twitter_handle = "";

if ($type ?? false && $slug ?? false) {
	$postdata = $core->getObject(array('type'=>$type, 'slug'=>$slug));

	if ($postdata['title'] ?? false)
		$meta_title = $postdata['title'];

	if ($postdata['short_description'] ?? false)
		$meta_description = $postdata['short_description'];

	$meta_image_url = ($uploads->getUploadedImageInSize($postdata['cover_url'], 'md')['url'] ?? 
            ($postdata['cover_url'] ?? 
            $meta_image_url)
        );
}
?>

<title><?=$meta_title?></title>
<meta name="description" content="<?=$meta_description?>">

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@<?=$twitter_handle?>" />
<meta name="twitter:creator" content="@<?=$twitter_handle?>" />

<meta property="og:title" content="<?=$meta_title?>">
<meta property="og:description" content="<?=$meta_description?>">

<meta property="og:image" content="<?=$meta_image_url?>">