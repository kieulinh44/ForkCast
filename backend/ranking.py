"""Deterministic conflict filters and server-composed, menu-sourced results.

These conservative common-term mappings are NOT a complete allergy/diet check.
"""
from decimal import Decimal, InvalidOperation
import re
from typing import Annotated, Literal
from pydantic import Field, ValidationError
from fastapi import HTTPException
from .models import StrictModel

ALLERGENS = {
    'peanut': ('peanut','groundnut'),
    'tree nut': ('almond','walnut','cashew','hazelnut','pecan','pistachio','macadamia','brazil nut','pine nut'),
    'milk': ('milk','butter','ghee','cheese','cream','yogurt','yoghurt','whey','casein','paneer'),
    'egg': ('egg','mayonnaise','mayo','aioli'),
    'wheat': ('wheat','flour','bread','breadcrumbs','pasta','couscous','seitan'),
    'soy': ('soy','soya','tofu','edamame','tempeh','miso'),
    'sesame': ('sesame','tahini'),
    'fish': ('fish','salmon','tuna','cod','anchovy','trout','haddock','sardine','tilapia'),
    'shellfish': ('shellfish','shrimp','prawn','crab','lobster','crayfish','scallop','oyster','mussel','clam'),
}
MEAT = ('chicken','beef','pork','bacon','ham','lamb','duck','turkey','veal','venison','sausage','chorizo','prosciutto','pepperoni','gelatin','lard','meat')
FISH = ALLERGENS['fish'] + ALLERGENS['shellfish']
GLUTEN = ALLERGENS['wheat'] + ('gluten','barley','rye','malt','bulgur','farro')
ALCOHOL = ('wine','beer','rum','whiskey','whisky','vodka','bourbon','brandy','alcohol')
BASE_CAUTION = 'Confirm ingredients and cross-contact with restaurant staff before ordering; menu text does not establish allergy safety.'
LIMITATION = 'Common conflict checks are incomplete. Missing ingredients, free-text restrictions, and religious compliance remain unverified; confirm with staff.'


def mentions(text, words):
    return any(re.search(r'(?<!\w)' + re.escape(word) + r'(?:s|es)?(?!\w)', text, re.I) for word in words)


def budget_value(profile):
    raw = profile.get('budget','').strip()
    if not raw:
        return None
    if not re.fullmatch(r'\d+(?:\.\d+)?', raw):
        return None
    try:
        value = Decimal(raw)
        return value if value.is_finite() and value >= 0 else None
    except InvalidOperation:
        return None


def budget_status(menu, item, profile):
    if not profile.get('budget','').strip():
        return 'not_set'
    if budget_value(profile) is None or item['price'] is None or menu['currency'] is None or menu['currency'] != profile.get('currency','USD'):
        return 'unknown'
    return 'within_budget'


def conflict_reason(item, profile):
    text = item['name'] + '\n' + item['description']
    allergies = profile.get('allergies','').lower()
    for category, aliases in ALLERGENS.items():
        triggers = (category,) + aliases
        if category == 'milk': triggers += ('dairy','lactose')
        if category == 'tree nut': triggers += ('nuts',)
        if mentions(allergies,triggers) and mentions(text,aliases):
            return 'Known allergy conflict in menu text: ' + category
    # Explicit non-major/free-text allergens still match their named ingredient.
    for token in re.findall(r'[a-z]+(?:[- ][a-z]+)?',allergies):
        if token not in {'none','no','allergy','allergies','allergic','to','and','or'} and mentions(text,(token,)):
            return 'Known allergy conflict in menu text'
    dietary = profile.get('dietary','').lower()
    if mentions(dietary,('vegan',)) and mentions(text,MEAT + FISH + ALLERGENS['milk'] + ALLERGENS['egg'] + ('honey',)):
        return 'Known vegan conflict in menu text'
    if mentions(dietary,('vegetarian',)) and mentions(text,MEAT + FISH):
        return 'Known vegetarian conflict in menu text'
    if mentions(dietary,('pescatarian','pescetarian')) and mentions(text,MEAT):
        return 'Known pescatarian conflict in menu text'
    if re.search(r'gluten[ -]?free|celiac|coeliac',dietary) and mentions(text,GLUTEN):
        return 'Known gluten restriction conflict in menu text'
    if re.search(r'(dairy|lactose)[ -]?free',dietary) and mentions(text,ALLERGENS['milk']):
        return 'Known dairy restriction conflict in menu text'
    if mentions(dietary,('halal',)) and mentions(text,('pork','bacon','ham','lard','prosciutto','pepperoni') + ALCOHOL):
        return 'Known halal requirement conflict in menu text; certification is unverified'
    if mentions(dietary,('kosher',)) and (mentions(text,('pork','bacon','ham','lard') + ALLERGENS['shellfish']) or (mentions(text,MEAT) and mentions(text,ALLERGENS['milk']))):
        return 'Known kosher requirement conflict in menu text; certification is unverified'
    dislikes = re.findall(r'[a-z]+',profile.get('dislikes','').lower())
    for term in dislikes:
        if term in {'none','no','and','or','dislike','dislikes','avoid','please','i'}:
            continue
        singular = term[:-1] if term.endswith('s') and len(term)>3 else term
        if mentions(text,(term,singular)):
            return 'Known dislike conflict in menu text'
    return None


def eligible_items(menu, profile):
    eligible, excluded = [], []
    budget = budget_value(profile)
    for item in menu['items']:
        reason = conflict_reason(item,profile)
        if not reason and budget is not None and budget_status(menu,item,profile) == 'within_budget' and Decimal(str(item['price'])) > budget:
            reason = 'Listed price exceeds saved per-dish budget in the same currency'
        if reason:
            excluded.append({'item_id':item['id'],'name':item['name'],'reason':reason})
        else:
            eligible.append(item)
    return eligible, excluded

class Selection(StrictModel):
    item_id: Annotated[str, Field(min_length=1,max_length=80)]
    evidence: Annotated[str, Field(min_length=1,max_length=2000)]
    match_tags: Annotated[list[Literal['craving','favorites','spice']], Field(max_length=3)] = []

class Selections(StrictModel):
    selections: Annotated[list[Selection], Field(max_length=3)]


def build_recommendations(menu, state, selected, excluded):
    try:
        parsed = Selections.model_validate(selected)
        ids = [entry.item_id for entry in parsed.selections]
        if len(ids) != len(set(ids)):
            raise ValueError('Duplicate IDs')
        allowed, _ = eligible_items(menu,state.get('profile',{}))
        by_id = {item['id']:item for item in allowed}
        result = []
        profile = state.get('profile',{})
        for entry in parsed.selections:
            item = by_id[entry.item_id]
            if not entry.evidence.strip() or not (entry.evidence in item['name'] or entry.evidence in item['description']):
                raise ValueError('Evidence mismatch')
            if len(entry.match_tags) != len(set(entry.match_tags)):
                raise ValueError('Duplicate tags')
            for tag in entry.match_tags:
                if not ((state.get('craving','').strip() or state.get('mood','').strip()) if tag == 'craving' else profile.get(tag,'').strip()):
                    raise ValueError('Unsupported context tag')
            reason = 'Menu evidence: “' + entry.evidence + '”.'
            phrases = {'craving':'saved craving','favorites':'saved favorites','spice':'saved spice preference'}
            if entry.match_tags:
                reason += ' Ranked for your ' + ', '.join(phrases[tag] for tag in entry.match_tags) + '.'
            cautions = [BASE_CAUTION]
            status = budget_status(menu,item,profile)
            if status == 'unknown':
                cautions.append('Budget cannot be verified: price, currency, or saved budget is unknown or currencies differ; no currency conversion is performed.')
            if item['price'] is None:
                cautions.append('Listed price is unknown; confirm with staff.')
            if menu['currency'] is None:
                cautions.append('Menu currency is unknown; confirm with staff.')
            if item.get('price_note'):
                cautions.append('Menu price note: ' + item['price_note'])
            result.append({'item_id':item['id'],'name':item['name'],'description':item['description'],'price':item['price'],'currency':menu['currency'],'reason':reason,'evidence':entry.evidence,'budget_status':status,'cautions':cautions})
        return {'items':result,'message':'' if result else 'No matching dishes were selected from the reviewed menu. No substitutes were invented.','excluded':excluded,'warnings':[LIMITATION]}
    except (ValidationError, ValueError, KeyError, TypeError):
        raise HTTPException(502,'AI service returned an invalid selection') from None
