#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
应用初始化脚本
在打包后的应用首次运行时，帮助设置正确的路径和配置
"""
import os
import sys
import json
import shutil
from pathlib import Path

def get_app_paths():
    """获取应用相关路径"""
    # 检测是否在打包环境中
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包环境
        app_dir = Path(sys.executable).parent
        is_packaged = True
    elif '__compiled__' in globals():
        # Nuitka 打包环境
        app_dir = Path(sys.executable).parent
        is_packaged = True
    else:
        # 开发环境
        app_dir = Path(__file__).parent.parent
        is_packaged = False
    
    return {
        'app_dir': str(app_dir),
        'is_packaged': is_packaged,
        'user_home': str(Path.home()),
        'documents': str(Path.home() / 'Documents'),
        'appdata': str(Path.home() / 'AppData' / 'Roaming' / 'JMF') if os.name == 'nt' else str(Path.home() / '.jmf')
    }

def create_default_config(config_path: Path, output_dir: str):
    """创建默认配置文件"""
    default_config = {
        'client': {
            'domain': [
                '18comic-mygo.vip',
                '18comic-mygo.org',
                '18comic-MHWs.CC',
                'jmcomic-zzz.one',
                'jmcomic-zzz.org'
            ],
            'retry_times': 3,
            'postman': {
                'meta_data': {
                    'proxies': None
                }
            }
        },
        'download': {
            'threading': {
                'image': 20
            },
            'image': {
                'suffix': '.jpg'
            },
            'cache': True
        },
        'dir_rule': {
            'base_dir': output_dir
        },
        'log': False
    }
    
    try:
        import yaml
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(default_config, f, default_flow_style=False, allow_unicode=True)
    except ImportError:
        # 如果没有PyYAML，创建一个简单的YAML格式文件
        config_path.parent.mkdir(parents=True, exist_ok=True)
        yaml_content = """client:
  domain:
    - 18comic-mygo.vip
    - 18comic-mygo.org
    - 18comic-MHWs.CC
    - jmcomic-zzz.one
    - jmcomic-zzz.org
  retry_times: 3
  postman:
    meta_data:
      proxies: null
download:
  threading:
    image: 20
  image:
    suffix: .jpg
  cache: true
dir_rule:
  base_dir: """ + output_dir.replace('\\', '/') + """
log: false
"""
        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(yaml_content)

def create_default_settings(settings_path: Path, output_dir: str):
    """创建默认应用设置"""
    default_settings = {
        'general': {
            'outputDir': output_dir,
            'autoOpenDir': False,
            'useCustomFont': True
        },
        'download': {
            'domains': [
                '18comic-mygo.vip',
                '18comic-mygo.org',
                '18comic-MHWs.CC',
                'jmcomic-zzz.one',
                'jmcomic-zzz.org'
            ],
            'retryTimes': 3,
            'imageThreads': 20,
            'enableProxy': False,
            'proxyAddress': '127.0.0.1:7890'
        },
        'advanced': {
            'enableLog': False,
            'imageFormat': '.jpg',
            'enableCache': True
        }
    }
    
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    with open(settings_path, 'w', encoding='utf-8') as f:
        json.dump(default_settings, f, indent=2, ensure_ascii=False)

def init_app():
    """初始化应用"""
    paths = get_app_paths()
    
    # 确定输出目录
    if paths['is_packaged']:
        # 打包环境：使用exe文件同级目录
        output_dir = str(Path(paths['app_dir']) / 'PDF')
        config_dir = str(Path(paths['app_dir']) / 'settings')
    else:
        # 开发环境：使用项目目录
        output_dir = str(Path(paths['app_dir']) / 'PDF')
        config_dir = str(Path(paths['app_dir']))
    
    # 创建必要的目录
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    Path(config_dir).mkdir(parents=True, exist_ok=True)
    
    # 创建配置文件
    config_path = Path(config_dir) / 'option.yml'
    settings_path = Path(config_dir) / 'settings.json'
    
    if not config_path.exists():
        try:
            create_default_config(config_path, output_dir)
            print(f"已创建配置文件: {config_path}")
        except Exception as e:
            print(f"创建配置文件失败: {e}")
    
    if not settings_path.exists():
        try:
            create_default_settings(settings_path, output_dir)
            print(f"已创建设置文件: {settings_path}")
        except Exception as e:
            print(f"创建设置文件失败: {e}")
    
    return {
        'success': True,
        'paths': paths,
        'output_dir': output_dir,
        'config_dir': config_dir,
        'config_path': str(config_path),
        'settings_path': str(settings_path)
    }

if __name__ == '__main__':
    result = init_app()
    print(json.dumps(result, indent=2, ensure_ascii=False))
