<?php
$types = json_decode(file_get_contents('../../config/types.json'), true);

// re-create models folder
$commands = "[[ app/models ]] && rm -r app/models && mkdir app/models; ";
// remove test for models
$commands .= "[[ -d tests/unit/models ]] && rm -r tests/unit/models; ";

foreach (array_keys($types) as $type) {
    if ($type == 'webapp' || in_array($type, ($types['webapp']['interface_urls'][basename(dirname(__FILE__))]['types'] ?? array_keys($types)))) {

        $type_hyphen = str_replace('_', '-', $type);
        $type_ucwords = str_replace(' ', '', ucwords(str_replace('_', ' ', $type)));
        $commands .= "echo \"import Model, { attr } from '@ember-data/model'; export default class ".$type_ucwords."Model extends Model { @attr     slug; @attr modules; }\" > app/models/".$type_hyphen.".js; ";
    }
}

exec($commands);
