<?php
if (file_exists('dist/index.html') !== false) {
	//get html
	$html = file_get_contents('dist/index.html');

	//replace head, before title
	$html = str_replace('<title>', '<?php include_once("php/_head.php");?><title>', $html);

	//replace head-footer, before </head> ends
	$html = str_replace('</head>', '<?php include_once("php/_head_footer.php");?></head>', $html);

	//replace body-footer, before </body> ends
	$html = str_replace('</body>', '<?php include_once("php/_body_footer.php");?></body>', $html);

	//load dom
	$dom = new DOMDocument();
	$dom->loadHTML($html);

	//for tags to be removed
	$remove = [];

	//remove meta description tag
	$metas = $dom->getElementsByTagName('meta');
	for($i=0; $i <$metas-> length; $i++) {
	    $name = $metas->item($i)->getAttribute("name");
	    if ($name == 'description')
	        $remove[] = $metas->item($i);
	}

	//remove title tag
	$titles = $dom->getElementsByTagName('title');
	foreach($titles as $item)
	  $remove[] = $item;

	//remove identified tags
	foreach ($remove as $item)
	  $item->parentNode->removeChild($item); 

	//save edit dom html
	$html = $dom->saveHTML();

	//prepend _init.php for $type and $slug and Tribe composer
	$html = '<?php include_once("php/_init.php");?>'.$html;

	//save to file
	file_put_contents('dist/index.php', $html);

	//echo success message on commandline
	echo '~~~~~~~~~~'."\r\n";
	echo `tput setaf 2`.'Middleware successfully installed. Synced "/dist" folder with PHP.'.`tput sgr0`."\r\n";
	echo '~~~~~~~~~~'."\r\n";
}
else {
	echo '~~~~~~~~~~'."\r\n";
	echo `tput setaf 1`.'Run "ember build -prod" before syncing with PHP.'.`tput sgr0`."\r\n";
	echo '~~~~~~~~~~'."\r\n";
}
?>