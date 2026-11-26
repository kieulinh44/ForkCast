"""Menu-grounded recommendation safety and budget behavior."""
import pytest
from fastapi import HTTPException

def dish(ident, name, description='', price=12):
    return {'id':ident,'name':name,'description':description,'price':price,'price_note':''}

def test_known_conflicts_excluded_before_any_ranking():
    from backend.ranking import eligible_items
    menu = {'currency':'USD','items':[
        dish('a','Lentil bowl','Lentils and lemon'),
        dish('b','Chicken wrap','Grilled chicken'),
        dish('c','Noodle bowl','Peanut sauce'),
        dish('d','Mushroom risotto'),
        dish('e','Deluxe vegetables',price=25),
        dish('f','Garden salad',price=None),
    ]}
    profile = {'dietary':'vegetarian','allergies':'peanut','dislikes':'mushrooms','budget':'20'}
    eligible, excluded = eligible_items(menu, profile)
    assert [item['id'] for item in eligible] == ['a','f']
    assert {item['item_id'] for item in excluded} == {'b','c','d','e'}
    assert all(item['reason'] for item in excluded)

@pytest.mark.parametrize('currency,price,profile,status',[
    ('USD',12,{'budget':'20'},'within_budget'),
    ('EUR',12,{'budget':'20'},'unknown'),
    (None,12,{'budget':'20'},'unknown'),
    ('USD',None,{'budget':'20'},'unknown'),
    ('EUR',12,{'budget':'20','currency':'EUR'},'within_budget'),
    ('USD',12,{},'not_set'),
    ('USD',12,{'budget':'any'},'unknown'),
])
def test_budget_status_and_unverified_warning(currency,price,profile,status):
    from backend.ranking import build_recommendations
    menu = {'currency':currency,'items':[dish('a','Bowl','Rice and beans',price)]}
    state = {'profile':profile,'craving':'fresh','mood':''}
    result = build_recommendations(menu,state,{'selections':[{'item_id':'a','evidence':'Rice and beans','match_tags':['craving']}]},[])
    assert result['items'][0]['budget_status'] == status
    assert result['items'][0]['price'] == price
    assert result['items'][0]['currency'] == currency
    assert 'confirm' in ' '.join(result['items'][0]['cautions']).lower()
    if status == 'unknown':
        assert 'budget cannot be verified' in ' '.join(result['items'][0]['cautions']).lower()
    assert 'Rice and beans' in result['items'][0]['reason']

@pytest.mark.parametrize('selection',[
    [{'item_id':'unknown','evidence':'Rice'}],
    [{'item_id':'a','evidence':'Invented saffron'}],
    [{'item_id':'a','evidence':'rice'}],
    [{'item_id':'a','evidence':''}],
    [{'item_id':'a','evidence':'Rice'},{'item_id':'a','evidence':'Rice'}],
    [{'item_id':'a','evidence':'Rice','match_tags':['allergy_safe']}],
    [{'item_id':'a','evidence':'Rice','match_tags':['favorites']}],
    [{'item_id':'a','evidence':'Rice','reason':'certified allergy safe'}],
])
def test_bad_selection_facts_and_unsupported_context_tags_rejected(selection):
    from backend.ranking import build_recommendations
    with pytest.raises(HTTPException) as err:
        build_recommendations({'currency':'USD','items':[dish('a','Bowl','Rice')]},{'profile':{}}, {'selections':selection},[])
    assert err.value.status_code == 502


def test_selected_food_mood_supports_craving_match_without_free_text():
    from backend.ranking import build_recommendations
    menu = {'currency': 'USD', 'items': [dish('a', 'Soup', 'Warm tomato soup')]}
    state = {'profile': {}, 'mood': 'Comforting', 'craving': ''}
    result = build_recommendations(menu, state, {'selections': [{'item_id': 'a', 'evidence': 'Warm tomato soup', 'match_tags': ['craving']}]}, [])
    assert result['items'][0]['name'] == 'Soup'
    assert 'saved craving' in result['items'][0]['reason']
