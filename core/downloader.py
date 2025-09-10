import os
import sys
import yaml
import json
import time
import shutil
import tempfile
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())
    os.system('chcp 65001 >nul 2>&1')

try:
    import jmcomic
    from fpdf import FPDF
    from PIL import Image
    from natsort import natsorted
except ImportError as e:
    print(f"缺少必要的Python包: {e}")
    print("请运行: pip install -r requirements.txt")
    sys.exit(1)


@dataclass
class DownloadConfig:
    """下载配置"""
    domains: List[str]
    base_dir: str = "."
    output_dir: str = "../PDF"
    image_format: str = ".jpg"
    max_retries: int = 3
    timeout: int = 30


class JMcomicDownloader:
    """JMcomic下载器"""
    
    def __init__(self, config_path: str = None):
        self.config_path = config_path or self._get_config_path()
        self.config = self._load_config()
        self.temp_dirs = []
        
    def _get_config_path(self) -> str:
        """获取配置文件路径"""
        script_dir = Path(__file__).parent
        config_files = ['option.yml', '../option.yml', '../../option.yml']
        
        for config_file in config_files:
            config_path = script_dir / config_file
            if config_path.exists():
                return str(config_path.resolve())
        
        # 如果没找到，创建默认配置
        return self._create_default_config()
    
    def _create_default_config(self) -> str:
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
                'impl': 'api',
                'postman': {
                    'meta_data': {
                        'cookies': {'AVS': None},
                        'proxies': '127.0.0.1:7890'
                    }
                },
                'retry_times': 3
            },
            'dir_rule': {
                'base_dir': '.',
                'rule': 'Bd_Aid'
            },
            'download': {
                'cache': True,
                'image': {
                    'decode': True,
                    'suffix': '.jpg'
                },
                'threading': {
                    'image': 20,
                    'photo': 8
                }
            },
            'log': True
        }
        
        config_path = Path(__file__).parent / 'option.yml'
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(default_config, f, default_flow_style=False, allow_unicode=True)
        
        return str(config_path)
    
    def _load_config(self) -> DownloadConfig:
        """加载配置"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
            
            domains = data.get('client', {}).get('domain', [])
            return DownloadConfig(
                domains=domains,
                base_dir=data.get('dir_rule', {}).get('base_dir', '.'),
                output_dir="../PDF",
                max_retries=data.get('client', {}).get('retry_times', 3)
            )
        except Exception as e:
            print(f"配置文件加载失败: {e}")
            # 返回默认配置
            return DownloadConfig(domains=[
                '18comic-mygo.vip',
                '18comic-mygo.org'
            ], output_dir="../PDF")
    
    def setup_domains(self) -> bool:
        """设置可用域名"""
        try:
            # 读取已验证的域名列表
            domains_file = Path(__file__).parent / 'checked_api.txt'
            if not domains_file.exists():
                domains_file = Path(__file__).parent / '../checked_api.txt'
            
            if domains_file.exists():
                with open(domains_file, 'r', encoding='utf-8') as f:
                    domains = [line.strip() for line in f if line.strip()]
                self.config.domains = domains
            
            # 更新配置文件
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config_data = yaml.safe_load(f)
            
            config_data['client']['domain'] = self.config.domains
            
            with open(self.config_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump(config_data, f, default_flow_style=False, allow_unicode=True)
            
            print(f"已配置 {len(self.config.domains)} 个域名")
            return True
            
        except Exception as e:
            print(f"域名配置失败: {e}")
            return False
    
    def validate_album_id(self, album_id: str) -> bool:
        """验证本子ID"""
        if not album_id or not album_id.strip():
            return False
        
        try:
            int(album_id.strip())
            return True
        except ValueError:
            return False
    
    def download_album(self, album_id: str) -> tuple[Optional[Any], Optional[str]]:
        """下载本子"""
        if not self.validate_album_id(album_id):
            raise ValueError("无效的本子ID")
        
        # 设置域名
        if not self.setup_domains():
            print("警告: 域名配置失败，使用默认配置")
        
        print(f"开始下载本子: {album_id}")
        print(f"使用域名: {', '.join(self.config.domains[:3])}...")
        
        try:
            # 创建jmcomic选项
            options = jmcomic.create_option_by_file(self.config_path)
            
            # 下载
            album, _ = jmcomic.download_album(album_id)
            
            # 查找下载的目录
            possible_dirs = [
                album.title,
                f"JM{album_id}",
                album_id
            ]
            
            download_dir = None
            for dir_name in possible_dirs:
                if os.path.exists(dir_name):
                    download_dir = dir_name
                    break
            
            if not download_dir:
                raise FileNotFoundError("未找到下载的文件目录")
            
            print(f"下载完成: {download_dir}")
            return album, download_dir
            
        except Exception as e:
            print(f"下载失败: {e}")
            raise
    
    def convert_images_to_pdf(self, img_dir: str, pdf_path: str) -> bool:
        """将图片转换为PDF"""
        if not os.path.exists(img_dir):
            print(f"图片目录不存在: {img_dir}")
            return False
        
        print(f"开始转换PDF: {img_dir} -> {pdf_path}")
        
        # 支持的图片格式
        supported_formats = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']
        images = []
        
        # 收集所有图片文件
        for root, dirs, files in os.walk(img_dir):
            for file in files:
                if any(file.lower().endswith(ext) for ext in supported_formats):
                    images.append(os.path.join(root, file))
        
        if not images:
            print("未找到图片文件")
            return False
        
        # 自然排序
        images = natsorted(images)
        print(f"找到 {len(images)} 张图片")
        
        # 创建PDF
        pdf = FPDF(unit="pt")
        temp_files = []
        
        try:
            for i, img_path in enumerate(images):
                print(f"处理图片 {i+1}/{len(images)}: {os.path.basename(img_path)}")
                
                try:
                    with Image.open(img_path) as img:
                        # 处理图片格式
                        if img.mode in ['RGBA', 'LA', 'P']:
                            # 创建白色背景
                            background = Image.new('RGB', img.size, (255, 255, 255))
                            if img.mode == 'P':
                                img = img.convert('RGBA')
                            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                            img = background
                        elif img.mode != 'RGB':
                            img = img.convert('RGB')
                        
                        # 获取图片尺寸
                        w, h = img.size
                        
                        # 处理特殊格式或需要重新保存的图片
                        if img_path.lower().endswith(('.webp', '.gif')) or img.mode != 'RGB':
                            temp_jpg = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
                            img.save(temp_jpg.name, 'JPEG', quality=95, optimize=True)
                            temp_files.append(temp_jpg.name)
                            use_path = temp_jpg.name
                            temp_jpg.close()
                        else:
                            use_path = img_path
                        
                        # 添加到PDF
                        orientation = 'P' if h > w else 'L'
                        pdf.add_page(orientation=orientation)
                        
                        # 计算适合的尺寸
                        if orientation == 'P':
                            max_w, max_h = 595, 842  # A4尺寸
                        else:
                            max_w, max_h = 842, 595
                        
                        scale = min(max_w / w, max_h / h, 1.0)
                        new_w, new_h = w * scale, h * scale
                        
                        # 居中放置
                        x = (max_w - new_w) / 2
                        y = (max_h - new_h) / 2
                        
                        pdf.image(use_path, x, y, new_w, new_h)
                        
                except Exception as e:
                    print(f"处理图片失败 {os.path.basename(img_path)}: {e}")
                    continue
            
            # 保存PDF
            os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
            pdf.output(pdf_path)
            print(f"PDF已保存: {pdf_path}")
            
            return True
            
        finally:
            # 清理临时文件
            for temp_file in temp_files:
                try:
                    os.remove(temp_file)
                except:
                    pass
    
    def cleanup_temp_files(self, *paths):
        """清理临时文件"""
        for path in paths:
            if path and os.path.exists(path):
                try:
                    if os.path.isdir(path):
                        shutil.rmtree(path)
                        print(f"已清理临时目录: {path}")
                    else:
                        os.remove(path)
                        print(f"已清理临时文件: {path}")
                except Exception as e:
                    print(f"清理失败 {path}: {e}")
    
    def download_and_convert(self, album_id: str) -> bool:
        """完整的下载和转换流程"""
        download_dir = None
        
        try:
            # 创建输出目录
            output_dir = Path(self.config.output_dir)
            output_dir.mkdir(exist_ok=True)
            
            # 下载
            album, download_dir = self.download_album(album_id)
            
            if not album or not download_dir:
                raise Exception("下载失败")
            
            # 生成PDF文件名
            safe_title = "".join(c for c in album.title if c.isalnum() or c in (' ', '-', '_')).strip()
            if not safe_title:
                safe_title = f"JM{album_id}"
            
            pdf_filename = f"{safe_title}.pdf"
            pdf_path = output_dir / pdf_filename
            
            # 如果文件已存在，添加ID后缀
            if pdf_path.exists():
                pdf_filename = f"{safe_title}_{album_id}.pdf"
                pdf_path = output_dir / pdf_filename
            
            # 转换为PDF
            success = self.convert_images_to_pdf(download_dir, str(pdf_path))
            
            if success:
                print(f"转换完成: {pdf_path}")
                
                # 清理下载目录
                self.cleanup_temp_files(download_dir)
                
                return True
            else:
                print("PDF转换失败")
                return False
                
        except Exception as e:
            print(f"操作失败: {e}")
            if download_dir:
                self.cleanup_temp_files(download_dir)
            return False


def main():
    """主函数"""
    if len(sys.argv) < 2:
        album_id = input("请输入本子ID: ").strip()
    else:
        album_id = sys.argv[1].strip()
    
    if not album_id:
        print("错误: 未提供本子ID")
        return 1
    
    downloader = JMcomicDownloader()
    
    try:
        success = downloader.download_and_convert(album_id)
        if success:
            print("✅ 完成!")
            return 0
        else:
            print("❌ 失败!")
            return 1
    except KeyboardInterrupt:
        print("\n操作已取消")
        return 1
    except Exception as e:
        print(f"未预期的错误: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
