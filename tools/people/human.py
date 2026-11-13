"""A figure of MakeHuman built with MPFB from a person's description (see tools/people/README.md),
shared by people.py (the campaign's people) and frozen.py (the Derelict's dead). Imported by
scripts Blender runs."""
from bl_ext.blender_org.mpfb.services import HumanService, TargetService


def asset(name):
    """MPFB's path of an asset (clothes, hair, eyebrows) by its name; none for an empty name."""
    return f'{name}/{name}.mhclo' if name else ''


def human(spec):
    """Builds a person into the scene from `spec`: its phenotype (gender, age, muscle, weight,
    height, proportions), hair, eyebrows, clothes, skin and targets, rigged with the game engine's
    rig so the clothes follow a pose. Returns the body's object."""
    info = HumanService._create_default_human_info_dict()
    pheno = TargetService.get_default_macro_info_dict()
    pheno.update(spec['phenotype'])
    pheno['race'] = spec.get('race', {'asian': 0.05, 'african': 0.05, 'caucasian': 0.9})
    info['phenotype'] = pheno
    info['eyes'] = 'low-poly/low-poly.mhclo'
    info['eyebrows'] = asset(spec['eyebrows'])
    info['eyelashes'] = 'eyelashes01/eyelashes01.mhclo'
    info['hair'] = asset(spec['hair'])
    info['clothes'] = [asset(c) for c in spec['clothes']]
    info['skin_mhmat'] = f"{spec['skin']}/{spec['skin']}.mhmat"
    info['skin_material_type'] = 'MAKESKIN'
    info['alternative_materials'] = {}
    # a rig, so the clothes are rigged as they are put on (a pose then moves all of them)
    info['rig'] = 'game_engine'
    info['targets'] = [{'target': name, 'value': value} for name, value in spec.get('targets', {}).items()]
    settings = HumanService.get_default_deserialization_settings()
    settings['subdiv_levels'] = 0
    return HumanService.deserialize_from_dict(info, settings)
